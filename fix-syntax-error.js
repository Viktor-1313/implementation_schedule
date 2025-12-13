// Скрипт для исправления синтаксической ошибки на строке 14385
const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, 'implementation_schedule.html');

console.log('🔧 Проверяю синтаксическую ошибку...');
let content = fs.readFileSync(filePath, 'utf8');

// Разбиваем на строки для анализа
const lines = content.split('\n');

// Проверяем строку 14385 (индекс 14384)
if (lines.length > 14384) {
    console.log(`Строка 14385: "${lines[14384]}"`);
    console.log(`Строка 14384: "${lines[14383]}"`);
    console.log(`Строка 14386: "${lines[14385]}"`);
    
    // Ищем проблему с закрывающими скобками
    const problemLine = lines[14384];
    
    // Проверяем баланс скобок вокруг проблемной строки
    let openBraces = 0;
    let closeBraces = 0;
    
    // Считаем скобки до проблемной строки
    for (let i = 0; i < 14385; i++) {
        const line = lines[i];
        openBraces += (line.match(/{/g) || []).length;
        closeBraces += (line.match(/}/g) || []).length;
    }
    
    console.log(`Баланс скобок до строки 14385: открывающих ${openBraces}, закрывающих ${closeBraces}`);
    
    // Ищем функцию recalculateFollowingTasks и проверяем её структуру
    let inRecalculateFunction = false;
    let braceCount = 0;
    let functionStart = -1;
    
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (line.includes('function recalculateFollowingTasks')) {
            inRecalculateFunction = true;
            functionStart = i;
            braceCount = 0;
        }
        
        if (inRecalculateFunction) {
            braceCount += (line.match(/{/g) || []).length;
            braceCount -= (line.match(/}/g) || []).length;
            
            if (braceCount === 0 && i > functionStart) {
                console.log(`Функция recalculateFollowingTasks заканчивается на строке ${i + 1}`);
                inRecalculateFunction = false;
            }
        }
    }
    
    // Ищем возможные проблемы: лишние закрывающие скобки или незакрытые блоки
    // Проверяем область вокруг строки 14385
    const contextStart = Math.max(0, 14380);
    const contextEnd = Math.min(lines.length, 14390);
    
    console.log('\nКонтекст вокруг строки 14385:');
    for (let i = contextStart; i < contextEnd; i++) {
        const marker = i === 14384 ? '>>> ' : '    ';
        console.log(`${marker}${i + 1}: ${lines[i]}`);
    }
    
    // Попробуем найти и исправить проблему
    // Часто проблема в том, что добавлен лишний код или неправильно закрыт блок
    const problemArea = lines.slice(14380, 14390).join('\n');
    
    // Ищем лишние закрывающие скобки
    if (problemArea.match(/^\s*}\s*$/m)) {
        console.log('\n⚠️ Найдена возможная лишняя закрывающая скобка');
    }
    
    // Проверяем, нет ли незакрытых блоков if/else
    const ifCount = (problemArea.match(/\bif\s*\(/g) || []).length;
    const elseCount = (problemArea.match(/\belse\b/g) || []).length;
    const openIf = (problemArea.match(/{/g) || []).length;
    const closeIf = (problemArea.match(/}/g) || []).length;
    
    console.log(`\nВ проблемной области: if=${ifCount}, else=${elseCount}, {=${openIf}, }=${closeIf}`);
    
    if (closeIf > openIf) {
        console.log('⚠️ Обнаружен избыток закрывающих скобок!');
        // Попробуем удалить лишнюю закрывающую скобку на строке 14385
        if (lines[14384].trim() === '}') {
            console.log('✅ Найдена лишняя закрывающая скобка на строке 14385, удаляю...');
            lines.splice(14384, 1);
            content = lines.join('\n');
            fs.writeFileSync(filePath, content, 'utf8');
            console.log('✅ Исправлено!');
        }
    }
}

console.log('\n✅ Проверка завершена');
