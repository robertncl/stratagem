export interface TechDef {
  id: string;
  name: string;
  era: number;
  cost: number;
  prereqs: string[];
  /** extra effects described in text (unit/building unlocks are derived) */
  note?: string;
}

const ERA_COST = [0, 30, 110, 300, 700, 1400, 2400, 2800, 3100, 3400, 3700, 4000];

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
  t('enlightenment', 'Enlightenment', 6, ['astronomy', 'economics']),
  // Industrial
  t('scientificMethod', 'Scientific Method', 7, ['enlightenment']),
  t('steamPower', 'Steam Power', 7, ['enlightenment', 'metallurgy']),
  t('rifling', 'Rifling', 7, ['militaryScience', 'metallurgy']),
  t('chemistry', 'Chemistry', 7, ['scientificMethod']),
  t('railroad', 'Railroad', 7, ['steamPower']),
  t('industrialization', 'Industrialization', 7, ['steamPower', 'economics']),
  // Modern
  t('electricity', 'Electricity', 8, ['scientificMethod', 'industrialization']),
  t('medicine', 'Medicine', 8, ['chemistry']),
  t('conscription', 'Conscription', 8, ['rifling', 'railroad']),
  t('machineTools', 'Machine Tools', 8, ['industrialization', 'rifling']),
  t('theCorporation', 'The Corporation', 8, ['industrialization']),
  // Atomic
  t('combustion', 'Combustion', 9, ['machineTools', 'electricity']),
  t('radio', 'Radio', 9, ['electricity']),
  t('automaticWeapons', 'Automatic Weapons', 9, ['machineTools', 'conscription']),
  t('refrigeration', 'Refrigeration', 9, ['electricity', 'medicine']),
  t('atomicTheory', 'Atomic Theory', 9, ['electricity', 'chemistry']),
  // Information
  t('computers', 'Computers', 10, ['radio', 'theCorporation', 'atomicTheory']),
  t('rocketry', 'Rocketry', 10, ['combustion', 'atomicTheory']),
  t('nuclearFission', 'Nuclear Fission', 10, ['atomicTheory']),
  t('mobileTactics', 'Mobile Tactics', 10, ['automaticWeapons', 'combustion']),
  t('composites', 'Composites', 10, ['combustion', 'atomicTheory']),
  // Space Age
  t('spaceFlight', 'Space Flight', 11, ['rocketry', 'composites'], 'Opens the space race'),
  t('satellites', 'Satellites', 11, ['spaceFlight', 'computers'], 'Charts the whole map'),
  t('robotics', 'Robotics', 11, ['computers', 'mobileTactics', 'refrigeration']),
  t('fusion', 'Fusion', 11, ['nuclearFission', 'satellites']),
];

export const TECHS: Record<string, TechDef> = Object.fromEntries(list.map((x) => [x.id, x]));
export const TECH_LIST = list;
export const ERA_NAMES = ['', 'Early Medieval', 'High Medieval', 'Late Medieval', 'Renaissance', 'Reformation', 'Enlightenment', 'Industrial', 'Modern', 'Atomic', 'Information', 'Space Age'];
