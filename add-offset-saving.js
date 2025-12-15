// Скрипт для добавления автоматического сохранения смещений при изменении дат
const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, 'implementation_schedule.html');

console.log('Чтение файла...');
let content = fs.readFileSync(filePath, 'utf8');

let modified = false;

// Добавляем сохранение смещений в функцию recalculateFollowingTasks
const recalculateFollowingTasksPattern = /(function recalculateFollowingTasks\(changedIndex\)\s*\{[\s\S]*?)(\s*updateStatistics\(\);)/;
if (recalculateFollowingTasksPattern.test(content)) {
    content = content.replace(recalculateFollowingTasksPattern, (match, funcBody, updateStats) => {
        // Проверяем, не добавлено ли уже сохранение смещений
        if (!funcBody.includes('saveTaskOffsets()')) {
            return funcBody + `
            // Сохраняем смещения после пересчета задач
            if (typeof saveTaskOffsets === 'function') {
                saveTaskOffsets();
            }` + updateStats;
        }
        return match;
    });
    modified = true;
    console.log('✅ Добавлено сохранение смещений в recalculateFollowingTasks');
} else {
    console.log('⚠️ Функция recalculateFollowingTasks не найдена или уже изменена');
}

// Добавляем сохранение смещений в onTaskTableInputChange после обработки дат
// Ищем место после обработки startDate и endDate
const onTaskTableInputChangePattern = /(} else if \(field === 'endDate'\)\s*\{[\s\S]*?task\.endDate = newEnd;[\s\S]*?\})/;
if (onTaskTableInputChangePattern.test(content)) {
    content = content.replace(onTaskTableInputChangePattern, (match) => {
        // Проверяем, не добавлено ли уже сохранение смещений
        if (!match.includes('saveTaskOffsets()') && !match.includes('// Сохраняем смещения')) {
            return match + `
            
            // Сохраняем смещения после изменения дат
            if ((field === 'startDate' || field === 'endDate') && typeof saveTaskOffsets === 'function') {
                saveTaskOffsets();
            }`;
        }
        return match;
    });
    modified = true;
    console.log('✅ Добавлено сохранение смещений в onTaskTableInputChange');
} else {
    // Пробуем более простой паттерн
    const simplePattern = /(task\.endDate = newEnd;[\s\S]*?} else if \(field === 'days'\))/;
    if (simplePattern.test(content)) {
        content = content.replace(simplePattern, (match, before, after) => {
            if (!match.includes('saveTaskOffsets()')) {
                return match.replace('} else if (field === \'days\')', `
            
            // Сохраняем смещения после изменения дат
            if ((field === 'startDate' || field === 'endDate') && typeof saveTaskOffsets === 'function') {
                saveTaskOffsets();
            }
            
            } else if (field === 'days')`);
            }
            return match;
        });
        modified = true;
        console.log('✅ Добавлено сохранение смещений в onTaskTableInputChange (простой паттерн)');
    } else {
        console.log('⚠️ Не удалось найти место для добавления сохранения смещений в onTaskTableInputChange');
    }
}

// Также добавляем сохранение смещений после recalculateTaskDatesWithWeekends в критических местах
// Это будет вызываться при изменении дат через drag&drop и другие способы

if (modified) {
    console.log('Сохранение файла...');
    fs.writeFileSync(filePath, content, 'utf8');
    console.log('✅ Изменения применены!');
} else {
    console.log('ℹ️ Изменения не требуются или уже применены');
}



