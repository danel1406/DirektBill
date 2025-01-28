const express = require('express');
const { PrismaClient } = require('@prisma/client');
const router = express.Router();
const prisma = new PrismaClient();

// Middleware to check if user is authenticated
const isAuthenticated = (req, res, next) => {
  if (req.isAuthenticated()) {
    return next();
  }
  req.flash('error', 'You must be logged in to access this page');
  res.redirect('/');
};

// Get invoice details
router.get('/:id', isAuthenticated, async (req, res) => {
  try {
    const invoice = await prisma.invoice.findUnique({
      where: { id: req.params.id },
      include: {
        service: {
          include: {
            user: true
          }
        },
        user: true,
        transactions: {
          include: {
            user: true
          },
          orderBy: {
            createdAt: 'desc'
          }
        }
      }
    });

    if (!invoice) {
      req.flash('error', 'Invoice not found');
      return res.redirect('/services');
    }

    // Check if user is authorized to view the invoice
    if (invoice.userId !== req.user.id && invoice.service.userId !== req.user.id) {
      req.flash('error', 'You are not authorized to view this invoice');
      return res.redirect('/services');
    }

    res.render('invoices/show', { invoice, user: req.user });
  } catch (error) {
    console.error('Invoice details error:', error);
    req.flash('error', 'Error loading invoice details');
    res.redirect('/services');
  }
});

// Show payment page
router.get('/:id/pay', isAuthenticated, async (req, res) => {
  try {
    const invoice = await prisma.invoice.findUnique({
      where: { id: req.params.id },
      include: {
        service: {
          include: {
            user: true
          }
        },
        user: true,
        transactions: {
          where: {
            status: 'COMPLETED'
          }
        }
      }
    });

    if (!invoice) {
      req.flash('error', 'Invoice not found');
      return res.redirect('/services');
    }

    if (invoice.status !== 'PENDING') {
      req.flash('error', 'This invoice cannot be paid');
      return res.redirect(`/invoices/${invoice.id}`);
    }

    // Calculate remaining amount
    const paidAmount = invoice.transactions.reduce((sum, t) => sum + t.amount, 0);
    const remainingAmount = invoice.total - paidAmount;

    res.render('invoices/pay', { 
      invoice, 
      user: req.user,
      remainingAmount,
      paidAmount
    });
  } catch (error) {
    console.error('Payment page error:', error);
    req.flash('error', 'Error loading payment page');
    res.redirect('/services');
  }
});

// Process payment
router.post('/:id/pay', isAuthenticated, async (req, res) => {
  try {
    const { amount, gateway } = req.body;
    const invoice = await prisma.invoice.findUnique({
      where: { id: req.params.id },
      include: {
        transactions: {
          where: {
            status: 'COMPLETED'
          }
        }
      }
    });

    if (!invoice || invoice.status !== 'PENDING') {
      req.flash('error', 'Invalid invoice');
      return res.redirect('/services');
    }

    // Validate payment amount
    const paidAmount = invoice.transactions.reduce((sum, t) => sum + t.amount, 0);
    const remainingAmount = invoice.total - paidAmount;
    const paymentAmount = parseFloat(amount);

    if (paymentAmount <= 0 || paymentAmount > remainingAmount) {
      req.flash('error', 'Invalid payment amount');
      return res.redirect(`/invoices/${invoice.id}/pay`);
    }

    // Create transaction
    const transaction = await prisma.transaction.create({
      data: {
        amount: paymentAmount,
        gateway: gateway || 'DEMO',
        status: 'COMPLETED', // Auto-complete for demo
        userId: req.user.id,
        invoiceId: invoice.id
      }
    });

    // Check if invoice is fully paid
    const newPaidAmount = paidAmount + paymentAmount;
    if (newPaidAmount >= invoice.total) {
      await prisma.invoice.update({
        where: { id: invoice.id },
        data: { status: 'PAID' }
      });
    }

    // Emit real-time updates
    const io = req.app.get('io');
    io.emit('invoiceUpdate', {
      type: 'payment',
      invoiceId: invoice.id,
      transaction
    });

    req.flash('success', 'Payment processed successfully');
    res.redirect(`/invoices/${invoice.id}`);
  } catch (error) {
    console.error('Payment processing error:', error);
    req.flash('error', 'Error processing payment');
    res.redirect(`/invoices/${req.params.id}/pay`);
  }
});

module.exports = router; 