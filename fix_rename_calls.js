const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, 'implementation_schedule.html');
let content = fs.readFileSync(filePath, 'utf8');

// Исправляем вызовы openRenameStageModal для передачи короткого названия
content = content.replace(
    /openRenameStageModal\(stageName\);/g,
    `// Извлекаем короткое название этапа для переименования
                            const stageMatch = stageName.match(/^(Этап\\s+\\d+)/);
                            const shortName = stageMatch ? stageMatch[1] : stageName;
                            openRenameStageModal(shortName);`
);

fs.writeFileSync(filePath, content, 'utf8');
console.log('✅ Исправлены вызовы openRenameStageModal');
