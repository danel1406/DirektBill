const express = require('express');
const router = express.Router();
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const os = require('os');
const { isAdmin } = require('../middleware/auth');

// Apply admin middleware to all routes
router.use(isAdmin);

// Admin Dashboard Page
router.get('/', async (req, res) => {
    try {
        const services = await prisma.service.findMany({
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
                        invoice: true
                    }
                }
            },
            orderBy: {
                createdAt: 'desc'
            }
        });

        res.render('admin/dashboard', { 
            services, 
            user: req.user,
            stats: {
                total: services.length,
                active: services.filter(s => s.status === 'ACTIVE').length,
                deleted: services.filter(s => s.status === 'DELETED').length
            }
        });
    } catch (error) {
        console.error('Admin dashboard error:', error);
        req.flash('error', 'Error loading admin dashboard');
        res.redirect('/');
    }
});

// API Endpoints for real-time stats
router.get('/api/system-stats', (req, res) => {
    const cpus = os.cpus();
    const networkInterfaces = os.networkInterfaces();
    
    // Calculate CPU average speed and usage
    const cpuSpeed = cpus.reduce((sum, cpu) => sum + cpu.speed, 0) / cpus.length;
    const loadAvg = os.loadavg();
    
    // Get network stats
    const network = Object.keys(networkInterfaces).reduce((acc, interfaceName) => {
        const interface = networkInterfaces[interfaceName];
        const ipv4 = interface.find(addr => addr.family === 'IPv4');
        if (ipv4) {
            acc[interfaceName] = {
                address: ipv4.address,
                netmask: ipv4.netmask
            };
        }
        return acc;
    }, {});

    const stats = {
        cpu: {
            usage: loadAvg[0], // 1 minute load average
            cores: cpus.length,
            speed: cpuSpeed,
            model: cpus[0].model,
            loadAverage: {
                '1min': loadAvg[0],
                '5min': loadAvg[1],
                '15min': loadAvg[2]
            }
        },
        memory: {
            total: os.totalmem(),
            free: os.freemem(),
            usage: ((os.totalmem() - os.freemem()) / os.totalmem() * 100).toFixed(2)
        },
        system: {
            platform: os.platform(),
            type: os.type(),
            release: os.release(),
            arch: os.arch(),
            uptime: os.uptime(),
            hostname: os.hostname()
        },
        network
    };
    res.json(stats);
});

router.get('/api/user-activity', async (req, res) => {
    try {
        const now = new Date();
        const yesterday = new Date(now - 24 * 60 * 60 * 1000);
        
        // Initialize an array for all 24 hours with 0 counts
        const hourlyData = Array.from({ length: 24 }, (_, i) => ({
            hour: i,
            count: 0
        }));

        // Get transaction counts grouped by hour
        const transactions = await prisma.transaction.findMany({
            where: {
                createdAt: {
                    gte: yesterday,
                    lte: now
                }
            },
            select: {
                createdAt: true
            }
        });

        // Count transactions per hour
        transactions.forEach(tx => {
            const hour = new Date(tx.createdAt).getHours();
            hourlyData[hour].count++;
        });

        // Rotate array so current hour is last
        const currentHour = now.getHours();
        const rotatedData = [
            ...hourlyData.slice(currentHour + 1),
            ...hourlyData.slice(0, currentHour + 1)
        ];

        res.json(rotatedData);
    } catch (error) {
        console.error('Error fetching user activity:', error);
        res.status(500).json({ error: 'Error fetching user activity' });
    }
});

// Permanently delete service and all related data
router.delete('/services/:id', async (req, res) => {
    const { id } = req.params;

    try {
        // Start a transaction to ensure all deletions succeed or none do
        const result = await prisma.$transaction(async (prisma) => {
            // Get the service and its related data
            const service = await prisma.service.findUnique({
                where: { id },
                include: {
                    transactions: {
                        include: {
                            invoice: true
                        }
                    }
                }
            });

            if (!service) {
                throw new Error('Service not found');
            }

            // Delete all related invoices first
            for (const transaction of service.transactions) {
                if (transaction.invoice) {
                    await prisma.invoice.delete({
                        where: { id: transaction.invoice.id }
                    });
                }
            }

            // Delete all related transactions
            await prisma.transaction.deleteMany({
                where: { serviceId: id }
            });

            // Finally, delete the service
            const deletedService = await prisma.service.delete({
                where: { id }
            });

            return deletedService;
        });

        // Log the successful deletion
        console.log(`Admin ${req.user.id} permanently deleted service ${id} and all related data`);

        // Emit real-time update
        req.app.get('io').emit('serviceUpdate', {
            type: 'permanentlyDeleted',
            serviceId: id
        });

        req.flash('success', 'Service and all related data have been permanently deleted');
        res.redirect('/admin');
    } catch (error) {
        console.error('Permanent service deletion error:', {
            serviceId: id,
            adminId: req.user.id,
            error: {
                message: error.message,
                code: error.code,
                meta: error.meta
            }
        });

        req.flash('error', `Error permanently deleting service: ${error.message}`);
        res.redirect('/admin');
    }
});

module.exports = router; 