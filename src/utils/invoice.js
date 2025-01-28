const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

// Generate an invoice number in the format INV-YYYYMMDD-XXXX
async function generateInvoiceNumber() {
    const date = new Date();
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const dateStr = `${year}${month}${day}`;

    // Get the count of invoices for today to generate the sequence
    const todayInvoices = await prisma.invoice.count({
        where: {
            invoiceNumber: {
                startsWith: `INV-${dateStr}`
            }
        }
    });

    const sequence = String(todayInvoices + 1).padStart(4, '0');
    return `INV-${dateStr}-${sequence}`;
}

// Calculate tax and total amount
function calculateInvoiceAmounts(amount, taxRate = 0.1) { // 10% tax rate by default
    const subtotal = amount;
    const tax = subtotal * taxRate;
    const total = subtotal + tax;

    return {
        subtotal,
        tax,
        total
    };
}

// Create an invoice for a transaction
async function createInvoiceForTransaction(transaction) {
    const invoiceNumber = await generateInvoiceNumber();
    const amounts = calculateInvoiceAmounts(transaction.amount);
    
    // Set due date to 30 days from now
    const dueDate = new Date();
    dueDate.setDate(dueDate.getDate() + 30);

    const invoice = await prisma.invoice.create({
        data: {
            invoiceNumber,
            transactionId: transaction.id,
            dueDate,
            ...amounts,
            notes: `Invoice for service: ${transaction.service.name}`
        },
        include: {
            transaction: {
                include: {
                    user: true,
                    service: true
                }
            }
        }
    });

    return invoice;
}

module.exports = {
    generateInvoiceNumber,
    calculateInvoiceAmounts,
    createInvoiceForTransaction
}; 