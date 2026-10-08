import type { RoomId } from '../../state/types';
import { schleuse } from './schleuse';
import type { RoomDef } from './types';
import { wartungszelle } from './wartungszelle';

export const ROOMS: Record<RoomId, RoomDef> = { wartungszelle, schleuse };
