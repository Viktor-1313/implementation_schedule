# Исправление !important в медиа-запросах

## Проблема
В медиа-запросах есть `position: static !important`, который переопределяет inline стили, устанавливаемые функцией `updateStickyColumns()`. Из-за этого столбцы не фиксируются даже после исправления основного CSS.

## Решение

### Шаг 1: Найдите медиа-запросы
Откройте файл `1/implementation_schedule.html` и найдите все места, где есть:
```css
position: static !important;
```

Используйте поиск (Ctrl+F) по тексту: `position: static !important`

### Шаг 2: Исправьте в медиа-запросах

Найдите и исправьте следующие места:

#### 1. Примерно строка 4761 (для планшетов):
```css
@media (max-width: 1024px) {
    .gantt-label {
        position: static !important; /* Отключаем sticky на мобильных */
        ...
    }
}
```

**Измените на:**
```css
@media (max-width: 1024px) {
    .gantt-label {
        /* position будет устанавливаться функцией updateStickyColumns */
        ...
    }
}
```

#### 2. Примерно строка 4798 (для мобильных):
```css
@media (max-width: 768px) {
    .gantt-label {
        position: static !important; /* Отключаем sticky на мобильных */
        ...
    }
}
```

**Измените на:**
```css
@media (max-width: 768px) {
    .gantt-label {
        /* position будет устанавливаться функцией updateStickyColumns */
        ...
    }
}
```

#### 3. Примерно строка 4806 (для заголовков):
```css
@media (max-width: 768px) {
    .gantt-header-label {
        position: static !important; /* Отключаем sticky на мобильных */
        ...
    }
}
```

**Измените на:**
```css
@media (max-width: 768px) {
    .gantt-header-label {
        /* position будет устанавливаться функцией updateStickyColumns */
        ...
    }
}
```

### Шаг 3: Быстрый способ через поиск и замену

1. Откройте файл в редакторе
2. Нажмите Ctrl+H (поиск и замена)
3. Найдите: `position: static !important;`
4. Замените на: `/* position: static !important; */`
5. Сохраните файл (Ctrl+S)
6. Обновите страницу в браузере (F5)

## Альтернативное решение

Если хотите оставить отключение sticky на мобильных, но разрешить на десктопе, можно использовать более умное условие:

```css
@media (max-width: 768px) {
    .gantt-label:not([style*="position: sticky"]) {
        position: static !important; /* Отключаем sticky только если не установлен через inline */
    }
}
```

Но проще всего - просто закомментировать все `position: static !important;`.

## Проверка

После исправления:
1. Сохраните файл
2. Обновите страницу (F5)
3. Включите тогл для столбца "Задача"
4. Прокрутите диаграмму горизонтально
5. Столбец должен фиксироваться и быть видимым!



