/**
 * remark plugin — strip the "## Common questions" section (the H2 heading and
 * every node until the next depth<=2 heading, or end of document) from rendered
 * markdown bodies.
 *
 * Why: brand/blog/glossary bodies author their FAQ as prose under
 * "## Common questions". The page templates lift that same Q&A out of the RAW
 * body (`entry.body`, which this plugin does NOT touch) into a <details>
 * accordion + FAQPage schema. Without this plugin the rendered <Content /> would
 * print the Q&A a second time as plain prose. Stripping it here keeps a single
 * visible copy (the accordion) and a single schema source.
 */
export default function remarkStripFaq() {
  return (tree) => {
    const ch = tree.children;
    let start = -1;
    for (let i = 0; i < ch.length; i++) {
      const n = ch[i];
      if (n.type === 'heading' && n.depth === 2 && toText(n).trim().toLowerCase().startsWith('common questions')) {
        start = i;
        break;
      }
    }
    if (start === -1) return;
    let end = ch.length;
    for (let j = start + 1; j < ch.length; j++) {
      if (ch[j].type === 'heading' && ch[j].depth <= 2) {
        end = j;
        break;
      }
    }
    ch.splice(start, end - start);
  };
}

function toText(node) {
  if (typeof node.value === 'string') return node.value;
  if (Array.isArray(node.children)) return node.children.map(toText).join('');
  return '';
}
