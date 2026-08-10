const PATTERNS: Record<string, string> = {
  "0":"nnnwwnwnn","1":"wnnwnnnnw","2":"nnwwnnnnw","3":"wnwwnnnnn","4":"nnnwwnnnw","5":"wnnwwnnnn","6":"nnwwwnnnn","7":"nnnwnnwnw","8":"wnnwnnwnn","9":"nnwwnnwnn",
  "A":"wnnnnwnnw","B":"nnwnnwnnw","C":"wnwnnwnnn","D":"nnnnwwnnw","E":"wnnnwwnnn","F":"nnwnwwnnn","G":"nnnnnwwnw","H":"wnnnnwwnn","I":"nnwnnwwnn","J":"nnnnwwwnn",
  "K":"wnnnnnnww","L":"nnwnnnnww","M":"wnwnnnnwn","N":"nnnnwnnww","O":"wnnnwnnwn","P":"nnwnwnnwn","Q":"nnnnnnwww","R":"wnnnnnwwn","S":"nnwnnnwwn","T":"nnnnwnwwn",
  "U":"wwnnnnnnw","V":"nwwnnnnnw","W":"wwwnnnnnn","X":"nwnnwnnnw","Y":"wwnnwnnnn","Z":"nwwnwnnnn","-":"nwnnnnwnw",".":"wwnnnnwnn"," ":"nwwnnnwnn","$":"nwnwnwnnn","/":"nwnwnnnwn","+":"nwnnnwnwn","%":"nnnwnwnwn","*":"nwnnwnwnn"
};

export default function Barcode39({ value }: { value: string }) {
  const clean = value.toUpperCase().replace(/[^0-9A-Z. \-$/+%]/g, "");
  const encoded = `*${clean}*`;
  const narrow = 2;
  const wide = 5;
  const gap = 2;
  const height = 44;
  let x = 0;
  const bars: Array<{ x: number; width: number }> = [];

  for (const char of encoded) {
    const pattern = PATTERNS[char];
    if (!pattern) continue;
    for (let i = 0; i < pattern.length; i += 1) {
      const width = pattern[i] === "w" ? wide : narrow;
      if (i % 2 === 0) bars.push({ x, width });
      x += width;
    }
    x += gap;
  }

  return (
    <svg viewBox={`0 0 ${x} ${height}`} preserveAspectRatio="none" aria-label={`Barcode ${clean}`}>
      <rect width={x} height={height} fill="white" />
      {bars.map((bar, index) => (
        <rect key={index} x={bar.x} y={0} width={bar.width} height={height} fill="black" />
      ))}
    </svg>
  );
}
