// Logo YOS360 en vectoriel (mêmes tracés que l'écran de chargement d'index.html)

const PIECES = [
  { fill: '#48B068', d: 'M466 692L897 456C925 441 953 455 953 488L953 984L469 1259Z' },
  { fill: '#117A35', d: 'M953 488C953 455 982 441 1010 457L1432 697L1432 1259L953 984Z' },
  { fill: '#117A35', d: 'M469 1259L810 1066L953 1143L953 1450C953 1490 910 1515 873 1494Z' },
  { fill: '#48B068', d: 'M953 1143L1091 1064L1432 1259L1031 1494C996 1515 953 1490 953 1450Z' },
];

/** Le cube seul. */
export function YosMark({ className = '', title }: { className?: string; title?: string }) {
  return (
    <svg viewBox="440 420 1020 1110" className={className} role={title ? 'img' : undefined} aria-hidden={title ? undefined : true}>
      {title && <title>{title}</title>}
      {PIECES.map((p) => <path key={p.d} fill={p.fill} d={p.d} />)}
    </svg>
  );
}

/** « YOS360 » : YOS en bleu, 360 en vert ; `onDark` éclaircit les couleurs sur fond sombre. */
export function YosWordmark({ className = '', onDark = false }: { className?: string; onDark?: boolean }) {
  return (
    <span className={`font-['Montserrat'] font-extrabold tracking-[-0.02em] leading-none ${className}`}>
      <span className={onDark ? 'text-[#4FAEEB]' : 'text-[#0270B8] dark:text-[#4FAEEB]'}>YOS</span>
      <span className={onDark ? 'text-[#5CC47D]' : 'text-[#48B068]'}>360</span>
    </span>
  );
}
