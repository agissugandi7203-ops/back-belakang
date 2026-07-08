import { EventEmitter } from 'events';

/**
 * Event emitter global untuk menyebarkan event real-time
 * dari controller ke WebSocket hub.
 */
export const adminEvents = new EventEmitter();
