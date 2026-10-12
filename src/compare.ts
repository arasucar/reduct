export type DiffLine = { kind: 'same' | 'added' | 'removed'; text: string; before?: number; after?: number };

/** Exact line comparison. Large documents use a coarse but lossless changed block. */
export function compareLines(before: string, after: string): { lines: DiffLine[]; coarse: boolean } {
  const left = before.split('\n'), right = after.split('\n');
  let prefix = 0;
  while (prefix < left.length && prefix < right.length && left[prefix] === right[prefix]) prefix++;
  let suffix = 0;
  while (suffix < left.length-prefix && suffix < right.length-prefix && left[left.length-1-suffix] === right[right.length-1-suffix]) suffix++;
  const a = left.slice(prefix,left.length-suffix), b = right.slice(prefix,right.length-suffix);
  const lines: DiffLine[] = left.slice(0,prefix).map((text,i)=>({kind:'same',text,before:i+1,after:i+1}));
  const coarse = a.length*b.length > 1_000_000;
  if (coarse) {
    a.forEach((text,i)=>lines.push({kind:'removed',text,before:prefix+i+1}));
    b.forEach((text,i)=>lines.push({kind:'added',text,after:prefix+i+1}));
  } else {
    const rows = Array.from({length:a.length+1},()=>new Uint32Array(b.length+1));
    for (let i=a.length-1;i>=0;i--) for(let j=b.length-1;j>=0;j--) rows[i][j]=a[i]===b[j]?rows[i+1][j+1]+1:Math.max(rows[i+1][j],rows[i][j+1]);
    let i=0,j=0;
    while(i<a.length || j<b.length) {
      if(i<a.length && j<b.length && a[i]===b[j]) { lines.push({kind:'same',text:a[i],before:prefix+i+1,after:prefix+j+1});i++;j++; }
      else if(i<a.length && (j===b.length || rows[i+1][j]>=rows[i][j+1])) { lines.push({kind:'removed',text:a[i],before:prefix+i+1});i++; }
      else { lines.push({kind:'added',text:b[j],after:prefix+j+1});j++; }
    }
  }
  for(let i=0;i<suffix;i++) lines.push({kind:'same',text:left[left.length-suffix+i],before:left.length-suffix+i+1,after:right.length-suffix+i+1});
  return {lines,coarse};
}
