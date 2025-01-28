const express = require('express');
const { PrismaClient } = require('@prisma/client');
const router = express.Router();
const prisma = new PrismaClient();
const { createInvoiceForTransaction } = require('../utils/invoice');

// Middleware to check if user is authenticated
const isAuthenticated = (req, res, next) => {
  if (req.isAuthenticated()) {
    return next();
  }
  req.flash('error', 'You must be logged in to access this page');
  res.redirect('/');
};

// Get all services
router.get('/', isAuthenticated, async (req, res) => {
  try {
    const services = await prisma.service.findMany({
      where: {
        status: 'ACTIVE'  // Only show active services
      },
      include: {
        user: {
          select: {
            email: true,
            firstName: true,
            lastName: true
          }
        },
        transactions: {
          include: {
            user: true,
            invoice: true
          }
        }
      },
      orderBy: {
        createdAt: 'desc'
      }
    });
    res.render('services/index', { services, user: req.user });
  } catch (error) {
    console.error('Services loading error:', error);
    req.flash('error', 'Error loading services');
    res.redirect('/');
  }
});

// Create service form
router.get('/new', isAuthenticated, (req, res) => {
  res.render('services/new', { user: req.user });
});

// Create service
router.post('/', isAuthenticated, async (req, res) => {
  try {
    const { name, description, price } = req.body;
    const service = await prisma.service.create({
      data: {
        name,
        description,
        price: parseFloat(price),
        userId: req.user.id
      }
    });

    // Create a pending transaction
    const transaction = await prisma.transaction.create({
      data: {
        amount: service.price,
        userId: req.user.id,
        serviceId: service.id,
        status: 'PENDING'
      },
      include: {
        service: {
          include: {
            user: {
              select: {
                email: true,
                firstName: true,
                lastName: true
              }
            }
          }
        },
        user: {
          select: {
            email: true,
            firstName: true,
            lastName: true
          }
        }
      }
    });

    // Generate pending invoice
    const invoice = await createInvoiceForTransaction({
      ...transaction,
      service: {
        ...transaction.service,
        name: service.name
      },
      status: 'PENDING'
    });

    // Emit real-time update
    req.app.get('io').emit('serviceUpdate', {
      type: 'created',
      service: {
        ...service,
        user: {
          email: req.user.email,
          firstName: req.user.firstName,
          lastName: req.user.lastName
        }
      }
    });

    // Redirect to order page to complete the purchase
    res.redirect(`/services/${service.id}/order?transaction=${transaction.id}`);
  } catch (error) {
    console.error('Service creation error:', error);
    req.flash('error', 'Error creating service');
    res.redirect('/services/new');
  }
});

// Get service details
router.get('/:id', isAuthenticated, async (req, res) => {
  try {
    const service = await prisma.service.findUnique({
      where: { id: req.params.id },
      include: {
        user: {
          select: {
            email: true,
            firstName: true,
            lastName: true
          }
        },
        transactions: {
          include: {
            user: {
              select: {
                email: true,
                firstName: true,
                lastName: true
              }
            },
            invoice: true
          },
          orderBy: {
            createdAt: 'desc'
          }
        }
      }
    });

    if (!service) {
      req.flash('error', 'Service not found');
      return res.redirect('/services');
    }

    // If service is deleted, only show to the owner or users with transactions
    if (service.status === 'DELETED') {
      const userHasTransactions = service.transactions.some(t => t.userId === req.user.id);
      if (service.userId !== req.user.id && !userHasTransactions) {
        req.flash('error', 'Service is no longer available');
        return res.redirect('/services');
      }
    }

    res.render('services/show', { service, user: req.user });
  } catch (error) {
    console.error('Service details error:', error);
    req.flash('error', 'Error loading service details');
    res.redirect('/services');
  }
});

// Edit service form
router.get('/:id/edit', isAuthenticated, async (req, res) => {
  try {
    const service = await prisma.service.findUnique({
      where: { id: req.params.id }
    });

    if (!service || service.userId !== req.user.id) {
      req.flash('error', 'You are not authorized to edit this service');
      return res.redirect('/services');
    }

    res.render('services/edit', { service, user: req.user });
  } catch (error) {
    req.flash('error', 'Error loading service');
    res.redirect('/services');
  }
});

// Update service
router.put('/:id', isAuthenticated, async (req, res) => {
  try {
    const { name, description, price } = req.body;
    const service = await prisma.service.findUnique({
      where: { id: req.params.id }
    });

    if (!service || service.userId !== req.user.id) {
      req.flash('error', 'You are not authorized to edit this service');
      return res.redirect('/services');
    }

    const updatedService = await prisma.service.update({
      where: { id: req.params.id },
      data: {
        name,
        description,
        price: parseFloat(price)
      }
    });

    // Emit real-time update
    req.app.get('io').emit('serviceUpdate', {
      type: 'updated',
      service: updatedService
    });

    req.flash('success', 'Service updated successfully');
    res.redirect(`/services/${req.params.id}`);
  } catch (error) {
    req.flash('error', 'Error updating service');
    res.redirect(`/services/${req.params.id}/edit`);
  }
});

// Delete service (soft delete)
router.delete('/:id', isAuthenticated, async (req, res) => {
  try {
    // First check if service exists
    const service = await prisma.service.findUnique({
      where: { id: req.params.id },
      include: {
        transactions: true
      }
    });

    if (!service) {
      console.error(`Service not found for deletion: ${req.params.id}`);
      req.flash('error', 'Service not found');
      return res.redirect('/services');
    }

    if (service.userId !== req.user.id) {
      console.error(`Unauthorized deletion attempt for service ${req.params.id} by user ${req.user.id}`);
      req.flash('error', 'You are not authorized to delete this service');
      return res.redirect('/services');
    }

    // Update service status to DELETED instead of deleting
    const updatedService = await prisma.service.update({
      where: { id: req.params.id },
      data: {
        status: 'DELETED',
        updatedAt: new Date()
      }
    });

    // Log successful status update
    console.log(`Service ${req.params.id} marked as DELETED by user ${req.user.id}`);

    // Emit real-time update
    req.app.get('io').emit('serviceUpdate', {
      type: 'deleted',
      service: updatedService
    });

    req.flash('success', 'Service has been deleted');
    res.redirect('/services');
  } catch (error) {
    console.error('Service deletion error:', {
      serviceId: req.params.id,
      userId: req.user.id,
      error: {
        message: error.message,
        code: error.code,
        meta: error.meta
      }
    });
    
    req.flash('error', `Error deleting service: ${error.message}`);
    res.redirect('/services');
  }
});

// Show order confirmation page
router.get('/:id/order', isAuthenticated, async (req, res) => {
  try {
    const service = await prisma.service.findUnique({
      where: { id: req.params.id },
      include: {
        user: {
          select: {
            email: true,
            firstName: true,
            lastName: true
          }
        }
      }
    });

    if (!service) {
      req.flash('error', 'Service not found');
      return res.redirect('/services');
    }

    // Check for existing pending transaction
    let transaction = null;
    if (req.query.transaction) {
      transaction = await prisma.transaction.findUnique({
        where: { id: req.query.transaction },
        include: {
          invoice: true
        }
      });

      if (!transaction || transaction.status !== 'PENDING') {
        req.flash('error', 'Invalid or expired transaction');
        return res.redirect('/services');
      }
    }

    // Calculate amounts
    const subtotal = service.price;
    const taxRate = 0.1; // 10% tax
    const tax = subtotal * taxRate;
    const total = subtotal + tax;

    res.render('services/order', { 
      service, 
      user: req.user,
      transaction,
      amounts: {
        subtotal,
        tax,
        total
      }
    });
  } catch (error) {
    console.error('Order page error:', error);
    req.flash('error', 'Error loading order page');
    res.redirect('/services');
  }
});

// Process order
router.post('/:id/order', isAuthenticated, async (req, res) => {
  try {
    const service = await prisma.service.findUnique({
      where: { id: req.params.id },
      include: {
        user: true
      }
    });

    if (!service) {
      req.flash('error', 'Service not found');
      return res.redirect('/services');
    }

    let transaction;
    let invoice;

    // Check if completing an existing transaction
    if (req.query.transaction) {
      transaction = await prisma.transaction.findUnique({
        where: { id: req.query.transaction },
        include: {
          invoice: true,
          service: {
            include: {
              user: true
            }
          },
          user: true
        }
      });

      if (!transaction || transaction.status !== 'PENDING') {
        req.flash('error', 'Invalid or expired transaction');
        return res.redirect('/services');
      }

      // Update existing transaction and invoice
      transaction = await prisma.transaction.update({
        where: { id: transaction.id },
        data: { status: 'COMPLETED' },
        include: {
          service: {
            include: {
              user: true
            }
          },
          user: true,
          invoice: true
        }
      });

      invoice = await prisma.invoice.update({
        where: { id: transaction.invoice.id },
        data: { status: 'PAID' }
      });
    } else {
      // Create new transaction and invoice
      transaction = await prisma.transaction.create({
        data: {
          amount: service.price,
          userId: req.user.id,
          serviceId: service.id,
          status: 'COMPLETED'
        },
        include: {
          service: {
            include: {
              user: true
            }
          },
          user: true
        }
      });

      invoice = await createInvoiceForTransaction({
        ...transaction,
        service: {
          ...transaction.service,
          name: service.name
        }
      });
    }

    // Emit real-time updates
    const io = req.app.get('io');
    
    // Notify all users about the transaction
    io.emit('transactionUpdate', {
      type: 'created',
      transaction,
      invoice
    });

    // Notify service provider specifically
    io.to(`user_${service.userId}`).emit('newTransaction', {
      transaction,
      invoice
    });

    req.flash('success', 'Payment successful! Your order has been completed.');
    res.redirect(`/transactions/${transaction.id}`);
  } catch (error) {
    console.error('Service order error:', error);
    req.flash('error', 'Error processing payment');
    res.redirect('/services');
  }
});

module.exports = router; 