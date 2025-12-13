// ФИНАЛЬНОЕ ИСПРАВЛЕНИЕ: Сохранение смещений ПЕРЕД изменением дат
const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, 'implementation_schedule.html');
console.log('🔧 Применяю финальное исправление...');
let content = fs.readFileSync(filePath, 'utf8');

// 1. Добавляем сохранение смещений в НАЧАЛЕ recalculateFollowingTasks
const recalcStart = /(function recalculateFollowingTasks\(changedIndex\)\s*\{\s*console\.log\('🔢 recalculateFollowingTasks: Начало пересчета с индекса', changedIndex\);)/;
if (recalcStart.test(content) && !content.includes('// КРИТИЧЕСКИ ВАЖНО: Сохраняем смещения ПЕРЕД пересчетом')) {
    content = content.replace(recalcStart, `$1
            
            // КРИТИЧЕСКИ ВАЖНО: Сохраняем смещения ПЕРЕД пересчетом, чтобы не потерять настройки
            if (typeof saveTaskOffsets === 'function') {
                saveTaskOffsets();
            }`);
    console.log('✅ Добавлено сохранение смещений в начале recalculateFollowingTasks');
}

// 2. Исправляем логику О_Н для использования смещений
// Ищем блок с offset, но проверяем, что он правильно использует сохраненное значение
const offsetCheck = /const offset = task\.offset !== undefined \? task\.offset :/;
if (offsetCheck.test(content)) {
    console.log('✅ Логика использования offset уже присутствует');
} else {
    // Ищем блок О_Н и заменяем его
    const onBlock = /(\} else \{\s*\/\/ О_Н \(по умолчанию\): окончание-начало[\s\S]*?if \(!prevTask\.endDate\) continue;[\s\S]*?)(newStart = new Date\(prevTask\.endDate\);[\s\S]*?newStart\.setDate\(newStart\.getDate\(\) \+ 1\);[\s\S]*?while \(!isWorkday\(newStart\)\) \{[\s\S]*?newStart\.setDate\(newStart\.getDate\(\) \+ 1\);[\s\S]*?\}[\s\S]*?const taskStartTime = safeGetTime\(task\.startDate\);)/;
    
    if (onBlock.test(content)) {
        content = content.replace(onBlock, `$1// ВАЖНО: Используем сохраненное смещение
                    const offset = task.offset !== undefined ? task.offset : (typeof calculateOffsetFromPredecessor === 'function' ? calculateOffsetFromPredecessor(i) : 0);
                    
                    // Вычисляем новую дату начала на основе окончания предшественника и смещения
                    if (offset === 0) {
                        // Задача начинается сразу после предшественника
                        newStart = new Date(prevTask.endDate);
                        newStart.setDate(newStart.getDate() + 1);
                        while (!isWorkday(newStart)) {
                            newStart.setDate(newStart.getDate() + 1);
                        }
                    } else if (offset > 0) {
                        // Задача начинается через N рабочих дней после окончания предшественника
                        newStart = new Date(prevTask.endDate);
                        newStart.setDate(newStart.getDate() + 1);
                        while (!isWorkday(newStart)) {
                            newStart.setDate(newStart.getDate() + 1);
                        }
                        // Добавляем offset рабочих дней
                        if (typeof addWorkdays === 'function') {
                            const workdays = getWorkdaysBetween(newStart, addWorkdays(newStart, offset));
                            if (workdays.length > 0 && workdays.length >= offset) {
                                newStart = workdays[offset - 1] || newStart;
                            }
                        }
                    } else {
                        // Задача начинается за N рабочих дней ДО окончания предшественника
                        const datesBack = getWorkdaysBackward(prevTask.endDate, Math.abs(offset));
                        if (datesBack && datesBack.length > 0) {
                            newStart = datesBack[Math.abs(offset) - 1] || datesBack[0];
                        } else {
                            newStart = new Date(prevTask.endDate);
                        }
                    }
                    
                    $2`);
        console.log('✅ Обновлена логика О_Н для использования смещений');
    }
}

// 3. Добавляем сохранение смещений ПЕРЕД изменением startDate в onTaskTableInputChange
const startDateBefore = /(\} else if \(field === 'startDate'\)\s*\{[\s\S]*?)(task\.startDate = parseDateFromInput\(input\.value\);)/;
if (startDateBefore.test(content) && !content.match(/} else if \(field === 'startDate'\)\s*\{[\s\S]*?\/\/ Сохраняем смещения ПЕРЕД изменением даты начала/)) {
    content = content.replace(startDateBefore, `$1// Сохраняем смещения ПЕРЕД изменением даты начала
                if (typeof saveTaskOffsets === 'function') {
                    saveTaskOffsets();
                }
                $2`);
    console.log('✅ Добавлено сохранение смещений ПЕРЕД изменением startDate');
}

// 4. Добавляем сохранение смещений ПЕРЕД изменением endDate
const endDateBefore = /(\} else if \(field === 'endDate'\)\s*\{[\s\S]*?const newEnd = parseDateFromInput\(input\.value\);[\s\S]*?)(\/\/ Правило: дата окончания)/;
if (endDateBefore.test(content) && !content.match(/} else if \(field === 'endDate'\)\s*\{[\s\S]*?\/\/ Сохраняем смещения ПЕРЕД изменением даты окончания/)) {
    content = content.replace(endDateBefore, `$1// Сохраняем смещения ПЕРЕД изменением даты окончания
                if (typeof saveTaskOffsets === 'function') {
                    saveTaskOffsets();
                }
                $2`);
    console.log('✅ Добавлено сохранение смещений ПЕРЕД изменением endDate');
}

fs.writeFileSync(filePath, content, 'utf8');
console.log('✅ Финальное исправление применено!');
console.log('\n📋 Проверьте работу:');
console.log('1. Настройте вторую задачу за 2 дня до окончания первой');
console.log('2. Добавьте один день первой задаче');
console.log('3. Вторая задача должна остаться за 2 дня до окончания первой');
