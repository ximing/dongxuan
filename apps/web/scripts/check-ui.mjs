import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const sourceRoot = fileURLToPath(new URL('../src/', import.meta.url));
const nativeControls = new Set(['input', 'select', 'option', 'button', 'textarea', 'details', 'summary', 'dialog']);
const violations = [];

async function checkDirectory(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      if (file !== path.join(sourceRoot, 'components', 'ui')) await checkDirectory(file);
    } else if (/\.tsx$/.test(entry.name)) {
      const source = await readFile(file, 'utf8');
      const tree = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
      function visit(node) {
        if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) {
          const tag = node.tagName.getText(tree);
          if (nativeControls.has(tag)) {
            const { line } = tree.getLineAndCharacterOfPosition(node.getStart(tree));
            violations.push(`${path.relative(sourceRoot, file)}:${line + 1} 请使用 components/ui 中的组件，不能直接使用 <${tag}>。`);
          }
        }
        ts.forEachChild(node, visit);
      }
      visit(tree);
    }
  }
}

await checkDirectory(sourceRoot);
if (violations.length) {
  console.error(violations.join('\n'));
  process.exitCode = 1;
} else {
  console.log('UI 检查通过：业务代码全部使用统一控件。');
}
