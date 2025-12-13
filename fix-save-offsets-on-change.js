// Скрипт для добавления сохранения смещений при изменении дат задач
const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, 'implementation_schedule.html');

console.log('Чтение файла...');
let content = fs.readFileSync(filePath, 'utf8');

// Найдем функцию onTaskTableInputChange и добавим сохранение смещений
// Ищем место после обработки startDate и endDate, но ПЕРЕД вызовом recalculateFollowingTasks

// Паттерн для поиска обработки startDate
const startDatePattern = /(} else if \(field === 'startDate'\)\s*\{[\s\S]*?task\.startDate = parseDateFromInput\(input\.value\);[\s\S]*?)(\/\/ Если уже есть дата окончания)/;

if (startDatePattern.test(content)) {
    content = content.replace(startDatePattern, (match, before, comment) => {
        // Проверяем, не добавлено ли уже сохранение смещений
        if (!before.includes('saveTaskOffsets()') && !before.includes('// Сохраняем смещения')) {
            return before + `
                // Сохраняем смещения перед изменением даты
                if (typeof saveTaskOffsets === 'function') {
                    saveTaskOffsets();
                }
                ` + comment;
        }
        return match;
    });
    console.log('✅ Добавлено сохранение смещений при изменении startDate');
}

// Паттерн для поиска обработки endDate
const endDatePattern = /(} else if \(field === 'endDate'\)\s*\{[\s\S]*?task\.endDate = newEnd;[\s\S]*?)(} else if \(field === 'days'\))/;

if (endDatePattern.test(content)) {
    content = content.replace(endDatePattern, (match, before, after) => {
        // Проверяем, не добавлено ли уже сохранение смещений
        if (!before.includes('saveTaskOffsets()') && !before.includes('// Сохраняем смещения')) {
            return before + `
                // Сохраняем смещения после изменения даты окончания
                if (typeof saveTaskOffsets === 'function') {
                    saveTaskOffsets();
                }
                ` + after;
        }
        return match;
    });
    console.log('✅ Добавлено сохранение смещений при изменении endDate');
}

// Также добавим сохранение смещений после пересчета дат задачи
// Ищем место после recalculateTaskDatesWithWeekends в onTaskTableInputChange
const afterRecalculatePattern = /(recalculateTaskDatesWithWeekends\(task\);[\s\S]*?)(\/\/ Пересчитываем даты задачи)/;

if (afterRecalculatePattern.test(content)) {
    content = content.replace(afterRecalculatePattern, (match, before, comment) => {
        if (!before.includes('saveTaskOffsets()')) {
            return before + `
                // Сохраняем смещения после пересчета дат
                if (typeof saveTaskOffsets === 'function') {
                    saveTaskOffsets();
                }
                ` + comment;
        }
        return match;
    });
    console.log('✅ Добавлено сохранение смещений после пересчета дат');
}

// Найдем все места, где вызывается recalculateFollowingTasks и убедимся, что смещения сохранены ПЕРЕД вызовом
const recalculateCalls = content.match(/recalculateFollowingTasks\([^)]+\);/g);
if (recalculateCalls) {
    recalculateCalls.forEach(call => {
        const callIndex = content.indexOf(call);
        const beforeCall = content.substring(Math.max(0, callIndex - 300), callIndex);
        
        // Если перед вызовом нет сохранения смещений, добавляем
        if (!beforeCall.includes('saveTaskOffsets()') && !beforeCall.includes('// Сохраняем смещения')) {
            const indent = beforeCall.match(/(\s+)$/)?.[1] || '            ';
            content = content.substring(0, callIndex) + 
                indent + '// Сохраняем смещения перед пересчетом последующих задач\n' +
                indent + 'if (typeof saveTaskOffsets === \'function\') {\n' +
                indent + '    saveTaskOffsets();\n' +
                indent + '}\n' +
                indent + call + 
                content.substring(callIndex + call.length);
        }
    });
    console.log('✅ Проверены все вызовы recalculateFollowingTasks');
}

// Сохраняем файл
console.log('Сохранение файла...');
fs.writeFileSync(filePath, content, 'utf8');
console.log('✅ Изменения применены!');
