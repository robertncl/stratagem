export interface TechDef {
  id: string;
  name: string;
  era: number;
  cost: number;
  prereqs: string[];
  /** extra effects described in text (unit/building unlocks are derived) */
  note?: string;
}

const ERA_COST = [0, 30, 110, 300, 700, 1400, 3400];

const t = (id: string, name: string, era: number, prereqs: string[], note?: string): TechDef => ({
  id,
  name,
  era,
  cost: ERA_COST[era],
  prereqs,
  note,
});

const list: TechDef[] = [
  t('pottery', 'Pottery', 1, []),
  t('masonry', 'Masonry', 1, []),
  t('archery', 'Archery', 1, []),
  t('horsebackRiding', 'Horseback Riding', 1, []),
  t('sailing', 'Sailing', 1, [], 'Units can embark onto coastal waters'),
  t('bronzeWorking', 'Bronze Working', 1, []),
  t('writing', 'Writing', 2, ['pottery']),
  t('currency', 'Currency', 2, ['bronzeWorking']),
  t('ironWorking', 'Iron Working', 2, ['bronzeWorking']),
  t('mathematics', 'Mathematics', 2, ['masonry']),
  t('feudalism', 'Feudalism', 2, ['bronzeWorking', 'horsebackRiding']),
  t('theology', 'Theology', 3, ['writing']),
  t('engineering', 'Engineering', 3, ['mathematics']),
  t('chivalry', 'Chivalry', 3, ['feudalism']),
  t('machinery', 'Machinery', 3, ['ironWorking', 'mathematics', 'archery']),
  t('banking', 'Banking', 3, ['currency', 'writing']),
  t('navigation', 'Navigation', 3, ['sailing', 'mathematics'], 'Units can embark onto the open ocean'),
  t('education', 'Education', 4, ['theology', 'mathematics']),
  t('steel', 'Steel', 4, ['machinery']),
  t('gunpowder', 'Gunpowder', 4, ['engineering', 'machinery']),
  t('printingPress', 'Printing Press', 5, ['education'], 'The first great power to discover it starts the Reformation'),
  t('metallurgy', 'Metallurgy', 5, ['gunpowder', 'steel']),
  t('astronomy', 'Astronomy', 5, ['navigation', 'education']),
  t('economics', 'Economics', 6, ['banking', 'printingPress']),
  t('militaryScience', 'Military Science', 6, ['metallurgy', 'chivalry']),
  t('enlightenment', 'Enlightenment', 6, ['astronomy', 'economics'], 'The first nation to reach the Enlightenment wins the game'),
];

export const TECHS: Record<string, TechDef> = Object.fromEntries(list.map((x) => [x.id, x]));
export const TECH_LIST = list;
export const ERA_NAMES = ['', 'Early Medieval', 'High Medieval', 'Late Medieval', 'Renaissance', 'Reformation', 'Enlightenment'];
