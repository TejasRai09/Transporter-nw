
import { EvalConfigSection } from './types';

export const SEASON_OPTIONS: string[] = (() => {
  const now = new Date();
  const startYear = now.getFullYear() - 1;
  const endYear = now.getFullYear() + 3;
  const seasons: string[] = [];
  for (let y = startYear; y <= endYear; y++) {
    const yy = String(y).slice(-2);
    const yy2 = String(y + 1).slice(-2);
    seasons.push(`SS${yy}-${yy2}`);
  }
  // Latest first
  return seasons.reverse().filter((s) => s !== 'SS25-26');
})();

export const EVAL_CONFIG: EvalConfigSection[] = [
  {
    title: 'Compliance & Documentation',
    points: 25,
    items: [
      {
        id: 'gps',
        label: 'GPS Non-functionality',
        options: [
          { label: '0 instances', val: 5 },
          { label: '1-2 instances', val: 3 },
          { label: '3-4 instances', val: 1 },
          { label: '≥5 instances', val: 0 },
        ],
      },
      {
        id: 'rto',
        label: 'RTO& factory rule violations',
        options: [
          { label: 'No instances', val: 'none' },
          { label: 'Overheight', val: 'overheight' },
          { label: 'Incomplete papers in truck', val: 'papers' },
          { label: 'Absence of reflector', val: 'reflector' },
          { label: 'Absence of red cloth', val: 'red_cloth' },
        ],
      },
    ],
  },
  {
    title: 'Operational Reliability',
    points: 30,
    items: [
      {
        id: 'timely_reporting',
        label: 'Timely reporting at the center (Unloading to Arrival)',
        options: [
          { label: 'On time (<=10% deviation)', val: 15 },
          { label: 'Minor delay (10-15% deviation)', val: 12 },
          { label: 'Moderate delay (15-30% deviation)', val: 8 },
          { label: 'Severe delay (>30% deviation)', val: 0 },
        ],
      },
      { id: 'mech', label: 'Condition of floor of the truck', options: [{ label: 'Good', val: 3 }, { label: 'Moderate', val: 2 }, { label: 'Bad', val: 0 }] },
      {
        id: 'brk',
        label: 'Loader Breakdown instances',
        options: [
          { label: '0 instances', val: 5 },
          { label: '1-2 instances', val: 3 },
          { label: '>2 instances', val: 0 },
        ],
      },
      {
        id: 'load',
        label: 'Loader Delay',
        options: [
          { label: '<60 minutes', val: 5 },
          { label: '60-90 minutes', val: 2 },
          { label: '>90 minutes', val: 0 },
        ],
      },
    ],
  },
  {
    title: 'Safety & Risk Management',
    points: 30,
    items: [
      {
        id: 'acc',
        label: 'Accident Record',
        options: [
          { label: 'No accident', val: 15 },
          { label: 'Minor: injury/spillage', val: -5 },
          { label: 'Major: rollover/damage', val: -10 },
          { label: 'Fatal: loss of life', val: 'DQ' },
        ],
      },
      {
        id: 'accident_reason',
        label: 'Reason for accident',
        options: [
          { label: 'Poor tyre condition', val: 'poor_tyre' },
          { label: 'Faulty brake', val: 'faulty_brakes' },
          { label: 'Damaged Road', val: 'damaged_road' },
          { label: 'Overweight', val: 'overweight' },
          { label: 'Overheight', val: 'overheight' },
          { label: "Driver's fault", val: 'driver_fault' },
          { label: 'Others', val: 'others' },
        ],
      },
      { id: 'safety_tyre', label: 'Tyre', options: [{ label: 'Poor', val: 0 }, { label: 'Average', val: 1 }, { label: 'Good', val: 2 }] },
      { id: 'safety_headlight', label: 'Headlight Functionality', options: [{ label: 'Working', val: 2 }, { label: 'Non-Working', val: 0 }] },
      {
        id: 'safety_fuel',
        label: 'Out of fuel',
        options: [
          { label: 'No instance', val: 4 },
          { label: '1 instance', val: 0 },
          { label: '>1 instance', val: -2 },
        ],
      },
      {
        id: 'safety_lic',
        label: 'Securing Cane (Missing Ropes & Belts)',
        options: [
          { label: 'No instance', val: 5 },
          { label: '1-2 instance', val: 2.5 },
          { label: '>2 instance', val: 0 },
        ],
      },
    ],
  },
  {
    title: 'Conduct & Behavior',
    points: 15,
    items: [
      {
        id: 'resp',
        label: 'Driver Absentee Incidents',
        options: [
          { label: '<=1 instance', val: 5 },
          { label: '2 instances', val: 0 },
          { label: '>2 instances', val: -5 },
        ],
      },
      {
        id: 'misc',
        label: 'Misconduct / Arguments',
        options: [
          { label: '0 instance', val: 5 },
          { label: '1 instance', val: 3 },
          { label: '2 instances', val: 0 },
          { label: '>2 instances', val: -5 },
        ],
      },
      { id: 'emerg', label: 'Willingness for substitute requirement', options: [{ label: 'Unwilling', val: 0 }, { label: 'Willing', val: 5 }] },
    ],
  },
];
