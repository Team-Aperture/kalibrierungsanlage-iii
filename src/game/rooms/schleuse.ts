// Temporary stub – replaced by the full observation passage.
import { LIGHTING } from '../../art/rooms/wartungszelle';
import { WZK, wzArt } from '../../art/rooms/wartungszelleBake';
import type { RoomDef } from './types';

export const schleuse: RoomDef = {
  id: 'schleuse',
  title: 'Hinter der Schleuse',
  bounds: { x0: 0, y0: 0, x1: 192, y1: 160 },
  bg: WZK.bg,
  lighting: LIGHTING,
  props: [],
  solids: () => [],
  lightingKey: () => 'lit',
  arrivals: { start: { x: 100, y: 100, facing: 'S' }, fromZelle: { x: 100, y: 100, facing: 'S' } },
  camera: () => wzArt().bounds,
  status: () => 'SEKTOR 0 · BEOBACHTUNGSGANG',
  bake: async () => undefined,
};
