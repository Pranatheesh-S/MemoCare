import type { UserRole } from "@smritisetu/shared-types";

declare global {
  namespace Express {
    interface Request {
      requestId: string;
      auth?: {
        userId: string;
        role: UserRole;
      };
      device?: {
        deviceId: string;
        patientId: string;
      };
      /** Patient the route is scoped to, set by requirePatientAccess. */
      patientId?: string;
    }
  }
}

export {};
