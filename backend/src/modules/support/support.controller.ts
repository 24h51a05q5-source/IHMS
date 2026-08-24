import { Router, Request, Response, NextFunction } from 'express';
import { supportService } from './support.service';
import { authenticate, authorize } from '../../common/guards/auth.guard';

const router = Router();

// Create new Support Ticket (Accessible to all authenticated users: Owner, Admin, Staff, Student)
router.post(
  '/tickets',
  authenticate,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const ticket = await supportService.createTicket(req.user, req.body);
      res.status(201).json({
        success: true,
        message: 'Your issue has been submitted successfully. Our support team will contact you soon.',
        ticket,
      });
    } catch (error) {
      next(error);
    }
  }
);

// Alias: POST /
router.post(
  '/',
  authenticate,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const ticket = await supportService.createTicket(req.user, req.body);
      res.status(201).json({
        success: true,
        message: 'Your issue has been submitted successfully. Our support team will contact you soon.',
        ticket,
      });
    } catch (error) {
      next(error);
    }
  }
);

// Get current user's submitted tickets
router.get(
  '/tickets/my',
  authenticate,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const tickets = await supportService.getUserTickets(
        req.user?.id || req.user?.userId,
        req.user?.email,
        req.user?.organizationId
      );
      res.json(tickets);
    } catch (error) {
      next(error);
    }
  }
);

// Alias: GET /my
router.get(
  '/my',
  authenticate,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const tickets = await supportService.getUserTickets(
        req.user?.id || req.user?.userId,
        req.user?.email,
        req.user?.organizationId
      );
      res.json(tickets);
    } catch (error) {
      next(error);
    }
  }
);

// Admin / Organization support view - List tickets
router.get(
  '/tickets',
  authenticate,
  authorize('OWNER', 'PLATFORM_SUPER_ADMIN', 'REGIONAL_MANAGER', 'BRANCH_MANAGER', 'WARDEN', 'ACCOUNTANT', 'RECEPTIONIST'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const isSuperAdmin = req.user?.role === 'PLATFORM_SUPER_ADMIN';
      const tickets = await supportService.getAllTickets(
        req.user?.organizationId,
        isSuperAdmin,
        {
          status: req.query.status as string,
          category: req.query.category as string,
          search: req.query.search as string,
        }
      );
      res.json(tickets);
    } catch (error) {
      next(error);
    }
  }
);

// Alias: GET /
router.get(
  '/',
  authenticate,
  authorize('OWNER', 'PLATFORM_SUPER_ADMIN', 'REGIONAL_MANAGER', 'BRANCH_MANAGER', 'WARDEN', 'ACCOUNTANT', 'RECEPTIONIST'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const isSuperAdmin = req.user?.role === 'PLATFORM_SUPER_ADMIN';
      const tickets = await supportService.getAllTickets(
        req.user?.organizationId,
        isSuperAdmin,
        {
          status: req.query.status as string,
          category: req.query.category as string,
          search: req.query.search as string,
        }
      );
      res.json(tickets);
    } catch (error) {
      next(error);
    }
  }
);

// Get specific ticket by ID
router.get(
  '/tickets/:id',
  authenticate,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const isStaffOrAdmin = req.user?.role !== 'STUDENT' && req.user?.role !== 'PARENT';
      const ticket = await supportService.getTicketById(
        req.params.id,
        req.user?.organizationId,
        req.user?.id || req.user?.userId,
        isStaffOrAdmin
      );
      res.json(ticket);
    } catch (error) {
      next(error);
    }
  }
);

// Update Ticket Status & Resolution Notes (Admin / Support action)
router.patch(
  '/tickets/:id/status',
  authenticate,
  authorize('OWNER', 'PLATFORM_SUPER_ADMIN', 'REGIONAL_MANAGER', 'BRANCH_MANAGER', 'WARDEN', 'ACCOUNTANT'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const ticket = await supportService.updateTicketStatus(
        req.params.id,
        req.user?.organizationId,
        req.body,
        req.user?.name || 'Support Staff'
      );
      res.json({
        success: true,
        message: `Ticket status updated to ${ticket.status}`,
        ticket,
      });
    } catch (error) {
      next(error);
    }
  }
);

export const supportRouter = router;
