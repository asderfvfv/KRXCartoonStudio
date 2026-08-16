# KRX Cartoon Studio

KRX Cartoon Studio — локальное Windows-приложение для сборки и анимации 2D-персонажей. Этап №3 добавляет детерминированный локальный рендер и экспорт:

`CHARACTER → MOTION LIBRARY → ACTOR → SCENE → ACTIONS → AUTO TIMELINE → PLAYBACK → RENDER / EXPORT`

Приложение работает локально, без облачного backend, AI и платных API. Функции Этапов №1 и №2 сохранены.

## Запуск

Требования: Windows 10/11, Node.js 22.12+ и npm 11+.

PowerShell:

```powershell
Set-Location D:\KRXCartoonStudio
npm install
npm run dev
```

CMD:

```bat
cd /d D:\KRXCartoonStudio
npm install
npm run dev
```

`npm install` нужен только после клонирования или смены зависимостей, не при каждом запуске.

Проверка и production-запуск:

```powershell
npm run typecheck
npm test
npm run build
npm start
```

`npm run build` создаёт renderer в `dist/renderer`, а Electron main/preload — в `dist-electron`.

## Этап №12 — Script → Cartoon (локально)

Панель **Script** (toolbar):

1. Вставить сценарий: `Имя: реплика`, сцены через `## Название` или пустую строку
2. Опционально `Characters: A, B` в шапке
3. Привязать имена к **готовым** персонажам проекта (Load Rig / Character Creator) — без нейро-генерации спрайтов
4. **Generate Cartoon** → сцены + актёры + диалоги + Talk actions + субтитры + lip sync
5. Опционально **Local TTS** (Windows System.Speech) на каждую реплику
6. Montage включается автоматически; опционально сразу **Export Montage Video**

**Тест-драка (AudioBeast):** кнопка **Тест: 3 монстра → драка** загружает локальные rig из `Characters/AudioBeast/`:

- **EmberPuff** — выходит и говорит «Эй, ты! Иди сюда!»
- **FrostFang** — выбегает, подбегает, драка (Attack/Hit)
- **GearBot** — смотрит со стороны (Scared/Surprised)

Арт скопирован из `D:\UnityProjects\AudioBeast` (без облака).

Миграция: `schemaVersion` ≥ 11.

## Шаблоны сцен / эпизодов

Встроенные локальные шаблоны (не хранятся в `.kcsproj`, без облака):

**Scenes** (левый сайдбар → `＋ Scene template…`, кнопка `＋` = Solo):

- Empty — пустая сцена
- Solo — один актёр по центру
- Duo — два актёра слева/справа
- Dialogue — duo + пример реплик и субтитры
- Action — Enter → WalkTo → Wave → Idle + Build Timeline

**Series** (панель Series → From template):

- Blank / One episode — один эпизод со всеми сценами
- Per scene — эпизод на каждую сцену
- Intro / Main / Outro — три эпизода по краям и середине

Применение episode-шаблона заменяет список эпизодов (с подтверждением).

## Этап №11 — Local Series Pack

Панель **Series** (toolbar):

- Список эпизодов: номер, название, вкл/выкл, порядок ↑↓
- Набор сцен на эпизод (чекбоксы); длительность считается как montage этих сцен
- Переходы cut/crossfade берутся из панели Montage
- **Export Series Pack** → локальная папка `SeriesName/` с файлами `E01_Title.mp4`… и `manifest.json`
- «Автопубликация» = готовый пакет на диске (без YouTube/облака)

Миграция: `schemaVersion` ≥ 9, поле `series`.

## Этап №10 — PartForge

Панель **PartForge** (toolbar) / Inspector → **Open PartForge**:

- Расширенная библиотека: Hat, Glasses, Sword, Wand, Shield, Speech Bubble, Book, Star, Heart, Cloud, Flag
- Цвет procedural SVG; attach любого project PNG/SVG asset
- Редактор: имя, socket type / exact socket, offset, rot, scale X/Y, anchor, z, opacity, flip X/Y
- Окно видимости на timeline (`startTime` / `endTime`) — preview и export
- Duplicate; Save / Apply / Delete пресеты в `project.attachmentPresets` (локально в .kcsproj)

Миграция: `schemaVersion` ≥ 8, поле `attachmentPresets[]`.

## Этап №9 — Montage Crossfade

Панель **Montage** → секция **Переход**:

- Тип: **Cut** (по умолчанию) или **Crossfade**
- Длительность crossfade (сек); автоматически ограничивается половиной короткой соседней сцены
- Итоговая длительность монтажа = сумма сцен − overlap × (число стыков)
- Export Montage Video / PNG Sequence: покадровый alpha-blend двух сцен (локально, без FFmpeg xfade-фильтра)
- Montage playback: индикатор XF % на timeline/canvas; переключение Scene на середине перехода
- Аудиодорожки смещаются на timeline-offset сегмента (с учётом overlap)

Миграция: `schemaVersion` ≥ 7, поля `montage.transition`, `montage.crossfadeDuration`.

## Этап №8 — Attachments + Montage Playback

### Attachments (PartForge-lite)

В Inspector → **Attachments**:

- Библиотека: Hat / Sword / Speech Bubble / Star (локальные procedural SVG)
- Attach любого project asset на socket актёра
- Socket types: HeadTop, Mouth, Hands, Feet, Custom
- Offset / rotation / scale; предмет следует за частью через иерархию Pixi (и в export)

Миграция: `schemaVersion` ≥ 6, поле `scene.attachments[]`.

### Montage Playback

В Timeline чекбокс **Montage**: play/scrub по глобальному timeline всех включённых сцен монтажа, автоматическое переключение Scene, локальное время для runtime/audio/субтитров.

## Этап №7 — Multi-scene Montage

Панель **Montage** (toolbar):

- Порядок сцен в монтаже (↑ / ↓), включение/выключение клипов
- Sync со списком Scene / Reset order
- Export Montage Video — непрерывная PNG-последовательность всех включённых сцен → локальный FFmpeg MP4/WebM
- Export Montage PNG Sequence — тот же порядок кадров без кодирования
- Аудиодорожки сцен смещаются на `offset` сегмента и микшируются в финальный файл
- Переходы: Cut или Crossfade (см. Этап №9)

Миграция: `schemaVersion` ≥ 5, поле `montage.clips[]`.

## Улучшение Lip Sync / Субтитров

Панель **Audio** (schema ≥ 10):

**Lip sync**
- Выравнивание WAV sample time по `track.startTime` + `trimStart` (не только local dialogue time)
- Smoothing (детерминированное окно) и Noise gate
- Text-driven fallback: гласные открывают рот сильнее, губные — слабее
- Лёгкий squash `scaleX` при открытии рта
- **Sync to track** у реплики — start/duration из linked audio

**Субтитры**
- Перенос строк, speaker name, цвет текста, фон/opacity, bottom offset, max width
- Preview и export используют одинаковые настройки
- **Export SRT…** — локальный `.srt` без облака

Миграция: `schemaVersion` ≥ 10; новые поля в `lipSyncSettings` / `subtitleSettings`.

## Этап №6 — Lip Sync по амплитуде WAV

Улучшение локального lip sync (панель **Audio**):

- Анализ PCM WAV → огибающая амплитуды (RMS), без облака и платных API
- Диалог со linked audio track управляет ртом **только своего актёра**
- Режим Prefer WAV amplitude (по умолчанию вкл.) + Sensitivity
- Если WAV envelope ещё не готов / файл не WAV — fallback на pulse по таймингу реплики
- Envelope кэш строится при импорте/TTS и перед экспортом

Миграция: `schemaVersion` ≥ 4, поле `lipSyncSettings` на сцене.

## Этап №5 — Character Creator

Панель **Character** (toolbar) / кнопка **Creator** в левом сайдбаре:

- Новый персонаж: пустой / procedural / из библиотеки DemoBot
- Слоты по порядку: тело → голова → глаза → рот → руки → ноги → одежда → цвета
- На слот: procedural SVG, библиотека DemoBot (`builtin://demobot/...`), или Import PNG
- Auto Parent по semantic roles, sockets (Mouth/Hands/HeadTop), Bind Pose
- Цвета procedural-палитры и tint актёра
- Save / Load Character Rig (`Characters/<Name>/character.json` + `Assets/`)

Procedural-части хранятся как локальные `data:image/svg+xml` и при Save проекта/персонажа материализуются в файлы. Облачных и платных API нет.

## Этап №4 — Local Audio / Dialogue / Lip Sync / Subtitles

Панель **Audio** (правый сайдбар):

- Import Audio — локальные WAV / MP3 / OGG
- Local TTS → Track — Windows `System.Speech` через Electron main (без облака и без платных API)
- Dialogues на timeline (актор, текст, start/duration)
- Субтитры в preview и опционально в export-кадрах
- Lip sync: локальная огибающая рта по таймингу реплик (`Mouth`, иначе лёгкий `Head`)
- Playback синхронизирует HTMLAudio с playhead
- Export Video может вшивать аудиодорожки через локальный FFmpeg

Миграция: `schemaVersion` ≥ 3, поля `audioAssets`, `audioTracks`, `dialogues`, `subtitleSettings`.

## Windows EXE (двойной клик)

Сборка установщика и portable (локально, без облака):

```powershell
Set-Location D:\KRXCartoonStudio
npm run dist
```

Готовые файлы:

- Portable: `D:\KRXCartoonStudio\release\KRX-Cartoon-Studio-Portable.exe`
- Installer: `D:\KRXCartoonStudio\release\KRX-Cartoon-Studio-Setup-0.1.0.exe`
- Распакованная папка: `D:\KRXCartoonStudio\release\win-unpacked\KRX Cartoon Studio.exe`

Обычный запуск для пользователя:

1. Двойной клик по `KRX-Cartoon-Studio-Portable.exe`
2. Или установить Setup и запускать ярлык **KRX Cartoon Studio**

Node.js / npm / PowerShell для запуска готового EXE не нужны. FFmpeg упакован в `resources/ffmpeg`. Приложение не подписано коммерческим сертификатом — Windows SmartScreen может показать предупреждение.

Другие команды сборки: `npm run pack` (только win-unpacked), `npm run portable` (только portable).

## Этап №3 — Render and Export

Панель **Export / Render** (кнопка `Export` в toolbar) управляет настройками мультфильма и экспортом.

### Настройки проекта

Сохраняются в `.kcsproj` как `renderSettings` и `schemaVersion: 2` (поле `version` проекта остаётся `1` для совместимости).

- Presets: YouTube Full HD (1920×1080), YouTube Shorts (1080×1920), Square (1080×1080), HD (1280×720), Custom
- Width / Height: 64…4096
- FPS: 1…60
- Duration > 0
- Background / Transparent Background
- Output format: MP4 (H.264 / yuv420p), WebM (VP9/VP8), PNG Sequence
- Quality: Draft / Standard / High (CRF 28 / 23 / 18)

Старые проекты Этапа №2 открываются с безопасными значениями по умолчанию через миграцию.

### Safe Frame

На Canvas доступны:

- Show Safe Frame — рамка конечной области экспорта и затемнение вне кадра
- Action Safe / Title Safe — вспомогательные зоны (только предпросмотр, в экспорт не попадают)

Предпросмотр масштабируется под окно, экспорт всегда идёт в `canvasWidth × canvasHeight`.

### Экспорт

1. **Export Current Frame** — PNG текущего playhead
2. **Export PNG Sequence** — `frame_000001.png…` в папке `<project>_<scene>_frames`
3. **Export Video** — временная PNG-последовательность → локальный FFmpeg → MP4/WebM

Рендер кадров:

- `time = frameIndex / fps`
- через `SceneRuntime.setTime` + оффскрин Pixi `SceneFrameRenderer`
- без реального playback и без UI/handles/safe zones в кадре
- playhead и UI восстанавливаются после экспорта

### Локальный FFmpeg

Используется пакет `ffmpeg-static@5.2.0` (локальный бинарник в `node_modules/ffmpeg-static`). Запуск только из Electron main process через `spawn(..., { shell: false })` и IPC. Облачных API нет.

Лог FFmpeg пишется рядом с временными кадрами / в указанный log path при ошибке.

Временные кадры видео создаются в `%TEMP%\kcs-export-*` и удаляются после успешного/завершённого экспорта. Пользовательские папки не удаляются автоматически.

### Ограничения Этапа №3

Не входят: аудио, lip sync, субтитры, AI, облако, публикация, installer, EXE, auto-update, физика, мультисценовый монтаж.

Проверено локально (smoke `?smoke=1`): PNG 640×360, sequence 10 кадров, MP4 H.264/yuv420p 640×360 @ 10 FPS. Диалоговый Export из UI и полный цикл Save → Restart → Open нужно подтвердить вручную в обычном `npm run dev`.

## Semantic Rig / Motion / Scene / Actions

Возможности Этапов №1–2 сохранены: Character Editor, Semantic Roles, Motion Library, Actor/Scene/Props/Camera, Actions, Auto Timeline, ручные правки timeline, детерминированный playback/scrubbing, Save/Open через preload/IPC.

## Форматы и сохранение

`.kcsproj` — versioned JSON (`version: 1`). Этап №3 добавляет `schemaVersion` и `renderSettings`. При открытии старого проекта миграция дополняет поля без поломки Actors/Actions/Timeline.

## Структура

```text
electron/                 Electron main/preload + export IPC + FFmpeg
src/domain/               Форматы, migration, renderSettings helpers
src/systems/              SceneRuntime, SceneFrameRenderer, ExportController, FFmpeg args
src/components/           Toolbar, Canvas, ExportPanel, Inspector, Timeline…
tests/                    Unit tests Этапов №1–3
```

## UX polish

- Esc — закрыть верхнюю панель / скрыть ошибку
- Space — Play/Pause (не в полях ввода и не при открытой панели)
- New Project и Delete Scene — с подтверждением
- Одна tool-панель за раз; длительность сцен в сайдбаре = playback (timeline)
- Scene CRUD синхронизирует Montage и Series
- Пустые состояния в левом сайдбаре; клик по error в status bar скрывает сообщение

## Что планируется дальше

Дорожная карта Этапов №1–12 закрыта (вкл. Script → Cartoon). Новые функции — по отдельному ТЗ. Платные и облачные API не планируются.
