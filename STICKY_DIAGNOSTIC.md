# ДИАГНОСТИКА: Почему sticky не работает

## 🔍 ШАГ 1: Проверить в консоли браузера

Откройте DevTools (F12), перейдите на вкладку Console и выполните этот код:

```javascript
// Диагностика sticky столбцов
const chart = document.getElementById('ganttChart');
const row = document.querySelector('.gantt-row');
const label = document.querySelector('.gantt-label');
const headerLabel = document.querySelector('.gantt-header-label');

console.log('=== ДИАГНОСТИКА STICKY ===');
console.log('1. Chart элемент:', chart);
console.log('   - scrollWidth:', chart?.scrollWidth);
console.log('   - clientWidth:', chart?.clientWidth);
console.log('   - offsetWidth:', chart?.offsetWidth);
console.log('   - getBoundingClientRect:', chart?.getBoundingClientRect());

console.log('\n2. Row элемент:', row);
console.log('   - scrollWidth:', row?.scrollWidth);
console.log('   - clientWidth:', row?.clientWidth);
console.log('   - offsetWidth:', row?.offsetWidth);
console.log('   - getBoundingClientRect:', row?.getBoundingClientRect());
console.log('   - computed display:', getComputedStyle(row).display);
console.log('   - computed overflow:', getComputedStyle(row).overflow);

console.log('\n3. Label элемент:', label);
console.log('   - style.position:', label?.style.position);
console.log('   - style.left:', label?.style.left);
console.log('   - computed position:', label ? getComputedStyle(label).position : 'N/A');
console.log('   - computed left:', label ? getComputedStyle(label).left : 'N/A');
console.log('   - getBoundingClientRect:', label?.getBoundingClientRect());

console.log('\n4. Header Label элемент:', headerLabel);
console.log('   - style.position:', headerLabel?.style.position);
console.log('   - style.left:', headerLabel?.style.left);
console.log('   - computed position:', headerLabel ? getComputedStyle(headerLabel).position : 'N/A');
console.log('   - computed left:', headerLabel ? getComputedStyle(headerLabel).left : 'N/A');

// Проверяем родительские контейнеры
console.log('\n5. Родительские контейнеры:');
let parent = label;
let level = 0;
while (parent && level < 5) {
    const style = getComputedStyle(parent);
    console.log(`   Level ${level}:`, parent.className || parent.tagName);
    console.log(`     - position:`, style.position);
    console.log(`     - overflow:`, style.overflow, style.overflowX, style.overflowY);
    console.log(`     - contain:`, style.contain);
    console.log(`     - display:`, style.display);
    console.log(`     - width:`, style.width);
    console.log(`     - max-width:`, style.maxWidth);
    parent = parent.parentElement;
    level++;
}
```

---

## 🔍 ШАГ 2: Проверить при прокрутке

Выполните этот код и прокрутите график вправо:

```javascript
// Мониторинг позиций при прокрутке
let scrollCheck = setInterval(() => {
    const chart = document.getElementById('ganttChart');
    const label = document.querySelector('.gantt-label');
    
    if (label && chart) {
        const labelRect = label.getBoundingClientRect();
        const chartRect = chart.getBoundingClientRect();
        
        console.log('Scroll:', chart.scrollLeft);
        console.log('Label left (getBoundingClientRect):', labelRect.left);
        console.log('Label style.left:', label.style.left);
        console.log('Chart left:', chartRect.left);
        console.log('Label computed left:', getComputedStyle(label).left);
        console.log('---');
    }
}, 500);

// Остановить через 10 секунд
setTimeout(() => clearInterval(scrollCheck), 10000);
```

---

## 🔍 ШАГ 3: Проверить, вызывается ли updateStickyColumns

```javascript
// Перехватываем вызовы updateStickyColumns
const originalUpdateStickyColumns = window.updateStickyColumns;
if (typeof updateStickyColumns === 'function') {
    window.updateStickyColumns = function() {
        console.log('updateStickyColumns вызвана!');
        console.trace();
        return originalUpdateStickyColumns.apply(this, arguments);
    };
}
```

---

## 💡 ВОЗМОЖНЫЕ ПРИЧИНЫ:

### 1. Родительский контейнер имеет ограниченную ширину
Если `.gantt-row` или `.gantt-chart` имеют `max-width` или ограниченную `width`, sticky будет работать только до этой границы.

**Решение:** Убедитесь, что родительские контейнеры не имеют ограничений ширины.

### 2. Sticky работает, но ограничен границами flex-контейнера
Flex-контейнер может ограничивать работу sticky.

**Решение:** Убедитесь, что sticky элементы имеют `flex-shrink: 0` и не сжимаются.

### 3. Overflow на промежуточных родителях
Если какой-то родитель между `.gantt-chart` и `.gantt-label` имеет `overflow: hidden` или `overflow: auto`, sticky не будет работать.

**Решение:** Проверьте все родительские элементы (шаг 1 покажет это).

### 4. Contain: layout на родителях
`contain: layout` создает новую область компоновки, которая ограничивает sticky.

**Решение:** Убедитесь, что нет `contain: layout` на родителях (вы уже убрали с `.chart-container`).

---

## 🎯 БЫСТРЫЙ ТЕСТ:

Выполните это в консоли для принудительного применения sticky:

```javascript
// Принудительное применение sticky
document.querySelectorAll('.gantt-label, .gantt-header-label').forEach(el => {
    el.style.position = 'sticky';
    el.style.left = '0px';
    el.style.zIndex = '999';
    el.style.backgroundColor = 'yellow'; // Временно для визуализации
    console.log('Применено sticky к:', el);
});
```

Если после этого столбец зафиксируется и будет желтым, значит проблема в функции `updateStickyColumns()` или в том, когда она вызывается.

---

## 📋 ЧТО ДЕЛАТЬ ДАЛЬШЕ:

После выполнения диагностики отправьте результаты, и я помогу найти точную причину проблемы.

