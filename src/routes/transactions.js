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

// Get all transactions for the user
router.get('/', isAuthenticated, async (req, res) => {
  try {
    const transactions = await prisma.transaction.findMany({
      where: {
        OR: [
          { userId: req.user.id },
          { 
            service: {
              userId: req.user.id
            }
          }
        ]
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
      },
      orderBy: {
        createdAt: 'desc'
      }
    });
    res.render('transactions/index', { transactions, user: req.user });
  } catch (error) {
    req.flash('error', 'Error loading transactions');
    res.redirect('/');
  }
});

// Create transaction form
router.get('/new/:serviceId', isAuthenticated, async (req, res) => {
  try {
    const service = await prisma.service.findUnique({
      where: { id: req.params.serviceId },
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

    res.render('transactions/new', { service, user: req.user });
  } catch (error) {
    req.flash('error', 'Error loading service');
    res.redirect('/services');
  }
});

// Create transaction
router.post('/', isAuthenticated, async (req, res) => {
  try {
    const { serviceId, amount } = req.body;
    const service = await prisma.service.findUnique({
      where: { id: serviceId },
      include: {
        user: true
      }
    });

    if (!service) {
      req.flash('error', 'Service not found');
      return res.redirect('/services');
    }

    // Create transaction with service provider details
    const transaction = await prisma.transaction.create({
      data: {
        amount: parseFloat(amount),
        userId: req.user.id,
        serviceId: service.id
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

    // Generate invoice for the transaction
    const invoice = await createInvoiceForTransaction(transaction);

    // Emit real-time update
    const io = req.app.get('io');
    io.emit('transactionUpdate', {
      type: 'created',
      transaction,
      invoice
    });

    // Notify service provider
    io.to(`user_${service.userId}`).emit('newTransaction', {
      transaction,
      invoice
    });

    req.flash('success', 'Transaction created successfully and invoice generated');
    res.redirect(`/transactions/${transaction.id}`);
  } catch (error) {
    console.error('Transaction creation error:', error);
    req.flash('error', 'Error creating transaction');
    res.redirect('/services');
  }
});

// Get transaction details
router.get('/:id', isAuthenticated, async (req, res) => {
  try {
    const transaction = await prisma.transaction.findUnique({
      where: { id: req.params.id },
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
        },
        invoice: true
      }
    });

    if (!transaction) {
      req.flash('error', 'Transaction not found');
      return res.redirect('/transactions');
    }

    // Check if user is authorized to view the transaction
    if (transaction.userId !== req.user.id && transaction.service.userId !== req.user.id) {
      req.flash('error', 'You are not authorized to view this transaction');
      return res.redirect('/transactions');
    }

    res.render('transactions/show', { transaction, user: req.user });
  } catch (error) {
    req.flash('error', 'Error loading transaction details');
    res.redirect('/transactions');
  }
});

// Update transaction status
router.put('/:id/status', isAuthenticated, async (req, res) => {
  try {
    const { status } = req.body;
    const transaction = await prisma.transaction.findUnique({
      where: { id: req.params.id },
      include: {
        service: true,
        invoice: true
      }
    });

    if (!transaction) {
      return res.status(404).json({ error: 'Transaction not found' });
    }

    // Update transaction status
    const updatedTransaction = await prisma.transaction.update({
      where: { id: req.params.id },
      data: { status },
      include: {
        service: true,
        user: true,
        invoice: true
      }
    });

    // Update invoice status based on transaction status
    if (transaction.invoice) {
      await prisma.invoice.update({
        where: { id: transaction.invoice.id },
        data: {
          status: status === 'COMPLETED' ? 'PAID' : 
                 status === 'CANCELLED' ? 'CANCELLED' : 'PENDING'
        }
      });
    }

    // Emit real-time update
    const io = req.app.get('io');
    io.emit('transactionUpdate', {
      type: 'updated',
      transaction: updatedTransaction
    });

    res.json({ success: true, transaction: updatedTransaction });
  } catch (error) {
    console.error('Transaction status update error:', error);
    res.status(500).json({ error: 'Error updating transaction status' });
  }
});

module.exports = router; 