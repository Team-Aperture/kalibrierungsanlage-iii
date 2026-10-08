import type { ItemId } from '../state/types';

export interface ItemInfo {
  name: string;
  description: string;
}

export const ITEMS: Record<ItemId, ItemInfo> = {
  sicherung: {
    name: 'Sicherungseinsatz F3',
    description:
      'Ein Keramikzylinder mit Messingkappen, etwa so lang wie ein Finger. Auf dem Körper ist „F3“ eingeprägt. Er ist kühl und überraschend schwer.',
  },
  kurbel: {
    name: 'Handkurbel',
    description:
      'Eine Notkurbel aus Stahl mit rotem Griff. Der Vierkant am Ende ist blank gescheuert – sie wurde oft benutzt.',
  },
};
