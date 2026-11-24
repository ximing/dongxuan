import { migrate } from '../db/migrate.js';
import { backfillLegacy } from './charts.js';
import { closeDb } from '../db/index.js';
try {
    await migrate();
    const result = await backfillLegacy();
    console.log(result);
    if (result.failed > 0) {
        console.error('旧盘回填尚有失败，请保留原始输入并修复后重试');
        process.exitCode = 1;
    }
}
finally {
    await closeDb();
}
