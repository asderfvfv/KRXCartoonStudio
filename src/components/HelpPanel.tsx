import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useEditor } from "../editor/EditorContext";

type HelpSectionId =
  | "overview"
  | "workflow"
  | "brain"
  | "scenes"
  | "director"
  | "path"
  | "timeline"
  | "script"
  | "voices"
  | "voiceStudio"
  | "lipSync"
  | "audio"
  | "export"
  | "hotkeys";

interface HelpSection {
  id: HelpSectionId;
  title: string;
  searchText: string;
  body: () => ReactNode;
}

function OverviewSection() {
  return (
    <>
      <h3>Обзор программы</h3>
      <p>
        <strong>KRX Cartoon Studio</strong> — полностью локальный редактор мультфильмов на вашем ПК.
        Облако, подписки и платные API <strong>не нужны</strong>. Текст, голоса, lip-sync, риги, PNG,
        музыка и экспорт MP4/WebM остаются на диске.
      </p>
      <h4>Что работает офлайн</h4>
      <ul className="help-checklist">
        <li>
          <strong>Voice Studio (Chatterbox)</strong> — генерация речи из текста на GPU/CPU внутри проекта (
          <code>voice-engine</code>, без интернета после установки моделей)
        </li>
        <li>
          <strong>Авто Lip Sync</strong> — выравнивание рта по уже известному тексту + WAV (forced alignment),
          без распознавания речи в облаке
        </li>
        <li>
          <strong>Piper</strong> — запасной локальный TTS (скрипт <code>setup-piper.ps1</code>). Робот Windows отключён.
        </li>
        <li>
          <strong>Мозг режиссёра</strong> — локальный алгоритм (как в MindCore): думает шагами, сам пишет
          мультфильм или рекламу, ставит жесты. Кидаете PNG/JPG/MP4 — он собирает ролик. Без облака и без
          нейросети.
        </li>
        <li>
          <strong>＋ Мультик</strong> — мастер из 5 шагов (герои → картинки → текст → голос → собрать)
        </li>
        <li>
          <strong>Промпт</strong> — текст → сцены, актёры, предметы, озвучка, музыка; чеклист «чего не хватает»
        </li>
        <li>Ручная сборка: сцены, слои, ручки, позы / IK, Режиссёр, путь (W), Timeline</li>
        <li>Монтаж сцен и экспорт фильма (FFmpeg встроен)</li>
        <li>Пресеты <strong>YouTube / Shorts</strong>, автосейв и недавние проекты</li>
      </ul>
      <h4>Где что на экране</h4>
      <ul>
        <li>
          <strong>Сверху</strong> — проект, Промпт, ＋ Мультик, <strong>Voice</strong>, Монтаж, Экспорт, Помощь (F1)
        </li>
        <li>
          <strong>Слева</strong> — сцены, актёры, картинки / предметы, жесты
        </li>
        <li>
          <strong>Центр</strong> — холст сцены
        </li>
        <li>
          <strong>Справа</strong> — Слои / Свойства / Действия / Аудио (блок Mouth Set у актёра)
        </li>
        <li>
          <strong>Внизу</strong> — Timeline (высота — жёлтая полоска над сеткой)
        </li>
      </ul>
      <p className="hint">
        Открыть справку: кнопка <strong>Помощь</strong> или <strong>F1</strong>. Слева — поиск по разделам.
        Подробно: мозг / реклама — раздел <strong>2</strong>; голос и рот — разделы <strong>8–10</strong>.
      </p>
    </>
  );
}

function WorkflowSection() {
  return (
    <>
      <h3>С чего начать</h3>
      <h4>Сцена: фон, актёры, предметы</h4>
      <ol className="help-steps">
        <li>
          <strong>Новая сцена:</strong> слева <strong>＋ Сцена</strong> (пустая) или шаблон — сразу сочный фон.
        </li>
        <li>
          <strong>Цвет / небо+земля:</strong> справа «Свойства» → <strong>Фон сцены</strong>. Режим
          <strong> Небо + земля</strong>: отдельно цвет неба и земли, ползунок <strong>Горизонт</strong>, палитра
          красит выбранный слой (кнопки «Красить небо / землю»). Пресеты — только необязательные примеры.
        </li>
        <li>
          <strong>PNG-фон:</strong> вкладка «Картинки» → <strong>Импорт PNG</strong> → кнопка <strong>Фон</strong>
          (картинка поверх цвета). Убрать — в том же блоке «Фон сцены».
        </li>
        <li>
          <strong>Предмет (дорога, дерево, дом…):</strong> это не 3D-модели. Нарисуй/скачай{" "}
          <strong>PNG с прозрачностью</strong> → слева <strong>Импорт PNG</strong> → «＋ На сцену» (или двойной
          клик). Инструмент <strong>G</strong> — двигать, <strong>S</strong> — масштаб. Для фона всей сцены — кнопка
          «Фон».
        </li>
        <li>
          <strong>Актёр:</strong> «＋ Добавить актёра» — готовый риг из списка или свой из Characters.
        </li>
        <li>
          <strong>Таскать целиком:</strong> инструмент <strong>G Актёр</strong>, клик по герою, тянете. Углы рамки =
          масштаб, кружок сверху = поворот.
        </li>
        <li>
          <strong>Слои сцены:</strong> справа вкладка <strong>Слои</strong> — порядок, видимость, копия, выравнивание.
        </li>
        <li>
          <strong>Части тела:</strong> инструмент <strong>V Часть</strong>. Слои персонажа — отдельная вкладка справа.
        </li>
      </ol>
      <h4>Фон сцены подробно</h4>
      <ul>
        <li>
          <strong>Цвет</strong> — сплошная заливка кадра; большая палитра (небо, трава, закат, ночь, комната, неон…).
        </li>
        <li>
          <strong>Небо + земля</strong> — вручную: цвет неба, цвет земли/травы, горизонт (%), мягкость края.
        </li>
        <li>
          <strong>Палитра</strong> красит выбранный слой (небо или землю), не сбрасывает режим.
        </li>
        <li>
          <strong>Пресеты</strong> — только быстрый старт; дальше крути цвета и горизонт сам.
        </li>
        <li>
          <strong>Цвет экспорта ← сцена</strong> — копирует цвет сцены в настройки Экспорта (не путать с PNG).
        </li>
        <li>
          PNG не заменяет цвет: если убрать картинку, снова видна заливка/градиент.
        </li>
      </ul>
      <h4>Блок «Предметы / картинки» не раздвигается?</h4>
      <p>
        Под блоком — <strong>жёлтая полоска</strong>: потяните вверх/вниз. Если панель обрезана — прокрутите левый
        столбец колёсиком. Заголовок только сворачивает блок, не меняет высоту.
      </p>
      <h4>Старт без DemoBot</h4>
      <p>
        По умолчанию — <strong>пустой проект</strong> (сцена без актёров). DemoBot открывается только кнопкой{" "}
        <strong>Демо DemoBot</strong> в окне проектов. Промпт / мозг режиссёра DemoBot <strong>не подставляют</strong>
        вместо Огонька или других героев.
      </p>
      <h4>Библиотека картинок</h4>
      <ul>
        <li>
          Слева вкладка <strong>Библиотека</strong> — превью, поиск, фильтры (предметы / фоны / в риге / свободные).
        </li>
        <li>Двойной клик или «＋ На сцену» — предмет; «Фон» — фон сцены.</li>
      </ul>
      <h4>Сохранение, автосейв и недавние</h4>
      <ul>
        <li>
          <strong>Ctrl+S</strong> / «Сохранить» — файл <code>.kcsproj</code>. Первый раз выберите папку («Как…» /
          Ctrl+Shift+S).
        </li>
        <li>
          <strong>Автосейв</strong> (~45 с после паузы) пишет в уже сохранённый файл. Вкл/выкл — окно «Проекты».
        </li>
        <li>
          В заголовке точка <strong>•</strong> = есть несохранённые правки. Внизу справа — статус автосейва.
        </li>
        <li>
          <strong>Проекты</strong> / «Недавние…» — до 12 файлов. Пропавшие с диска убираются («Обновить список»).
        </li>
      </ul>
      <h4>Быстрый мультик или реклама</h4>
      <ol className="help-steps">
        <li>
          Импорт PNG/JPG/видео (первый кадр) → <strong>Промпт</strong> или <strong>＋ Мультик</strong> → блок
          <strong>Мозг режиссёра</strong> → Мультфильм / Реклама → <strong>Придумать и собрать</strong>.
        </li>
        <li>
          Либо <strong>＋ Мультик</strong> вручную: 5 шагов герои → картинки → текст → голос → собрать.
        </li>
        <li>
          Либо <strong>Промпт</strong> — свой текст со сценами (раздел «7. Промпт»). Как думает мозг — раздел
          <strong>2</strong>.
        </li>
        <li>
          После сборки смотрите <strong>Монтаж ▶</strong>, затем правьте жестами, путём (W) и Voice Studio.
        </li>
      </ol>
      <h4>Озвучка «с нуля» (рекомендуемый путь)</h4>
      <ol className="help-steps">
        <li>Один раз поставьте движок: <code>voice-engine\setup-voice-engine.ps1</code> (Python + Chatterbox).</li>
        <li>
          Создайте профиль голоса в <strong>Voice</strong> (референс WAV 3–10 с чистой речи).
        </li>
        <li>Сгенерируйте реплику → при необходимости <strong>Авто Lip Sync</strong> → <strong>На Timeline</strong>.</li>
        <li>В свойствах актёра выберите режим <strong>Mouth Set</strong> (Simple / Basic / Advanced).</li>
      </ol>
    </>
  );
}

function BrainSection() {
  return (
    <>
      <h3>Мозг режиссёра — мультфильмы и реклама</h3>
      <p>
        Это <strong>локальный алгоритм</strong> (порт генератора MindCore), а не облачная нейросеть и не отдельный
        сервис. Он думает фиксированными шагами, выбирает шаблон сцен, пишет промпт и ставит жесты, которые уже умеет
        студия (вход, ходьба, мах, прыжок, радость). Интернет не нужен.
      </p>
      <h4>Как мозг думает (по шагам)</h4>
      <ol className="help-steps">
        <li>
          <strong>Герои.</strong> Берёт имена ригов из проекта. Если героев нет — подставляет Огонёк / Морозко /
          Винтик.
        </li>
        <li>
          <strong>Картинки и видео.</strong> Только те, что вы нажали «Положить…» в блоке мозга — не вся библиотека
          проекта. PNG/JPG/WebP и первый кадр MP4. Широкий кадр ≈ фон; портрет/UI ≈ продукт. Не больше 3 кадров в
          рекламе.
        </li>
        <li>
          <strong>Задача.</strong> <em>Мультфильм</em> — сюжет под вашу идею (гости / приключение / комедия / дружба /
          ночь / гонка / подарок / находка / погода / починка / концерт / клад). Идея вплетается в первую и последнюю
          реплики. Жесты ставятся всем героям.{" "}
          <em>Реклама</em> — короткий ролик на <strong>студийном фоне</strong> (без поляны): хук → продукт → призыв.
          На каждой сцене одна картинка по размеру кадра; герои сбоку. Музыку и TTS мозг сам не включает — только
          если вы задали папку / галочку в панели.
        </li>
        <li>
          <strong>Стратегия MindCore.</strong> Равномерно, баланс, горячие/холодные шаблоны, покрытие (чтобы варианты
          не повторялись), смешанно.
        </li>
        <li>
          <strong>Шаблон + жесты.</strong> В каждую сцену пишет ремарку в скобках: «входит слева, машет, прыжок, ура».
          Сборщик читает эти слова и ставит Enter / Walk / Wave / Jump / Happy <em>всем героям</em>. Потом по каждой
          реплике — жест говорящего, взгляд слушателей, лёгкая камера, озвучка (Chatterbox/Piper) и lip-sync.
        </li>
        <li>
          <strong>Только диск.</strong> Риги, PNG, TTS, FFmpeg. Облако и сторонние API не вызываются.
        </li>
      </ol>
      <h4>Рекламные ролики</h4>
      <p>
        По умолчанию реклама <strong>не берёт</strong> героев, озвучку и музыку из нижней части панели Промпт.
        В блоке мозга видно чеклист: картинки / герои / озвучка / музыка — только галочки, которые вы включили.
        Без галочки «Добавить героев» — только ваши кадры с вау-анимацией и короткий диктор.
        Голос по умолчанию: <strong>Chatterbox (живой)</strong>, иначе Piper. Робот Windows отключён.
        Свой тембр: Voice → профиль + reference WAV.
      </p>
      <h4>Мультфильмы</h4>
      <p>
        Режим <strong>Мультфильм</strong> включён по умолчанию. Напишите идею («в гости к Винтику», «клад», «дождь») —
        мозг выбирает сюжет, вплетает идею в реплики, ставит жесты <em>всем</em> героям и раскладывает картинки по
        сценам. Дальше тот же сборщик: сцены, актёры, TTS, музыка. Кнопка <strong>Придумать и собрать</strong> делает
        всё сразу.
      </p>
      <h4>Положить картинки / видео и собрать</h4>
      <ol className="help-steps">
        <li>
          Откройте <strong>Промпт</strong> или <strong>＋ Мультик</strong> (шаг «Текст»).
        </li>
        <li>
          Выберите Мультфильм или Реклама, при желании напишите продукт / идею.
        </li>
        <li>
          <strong>Положить картинки / видео…</strong> — PNG, JPG, WebP, MP4, WebM, MOV. Файлы копируются в проект
          как PNG.
        </li>
        <li>
          <strong>Придумать 3 варианта</strong> — три сюжета; клик по карточке вставляет текст в поле.
        </li>
        <li>
          <strong>Придумать и собрать</strong> — берёт лучший вариант и сразу собирает сцены, актёров, предметы,
          жесты, голос и музыку (если включены).
        </li>
      </ol>
      <h4>Что получится на выходе</h4>
      <ul>
        <li>Готовый текст промпта: Characters, Props, Genre, Atmosphere, сцены, реплики, ремарки жестов.</li>
        <li>Список «мыслей» мозга (герои → картинки → задача → стратегия → жесты → локально).</li>
        <li>После сборки — фильм на Timeline. Дальше правьте путём (W), жестами и Voice Studio.</li>
      </ul>
      <h4>Чего мозг не делает</h4>
      <ul>
        <li>Не рисует новые картинки и не генерирует нейросетевое видео.</li>
        <li>Не проигрывает MP4 как живое видео на холсте — только первый кадр как PNG.</li>
        <li>Не ходит в интернет и не подключает ChatGPT / облачный монтаж.</li>
      </ul>
    </>
  );
}

function ScenesSection() {
  return (
    <>
      <h3>Сцены и переходы</h3>
      <p>
        Панель <strong>«Сцены и переходы»</strong> — лента фильма. Полная панель: <strong>Монтаж / экспорт…</strong>.
      </p>
      <h4>Лента карточек</h4>
      <ul>
        <li>
          <strong>Перетащите</strong> карточку — новый порядок
        </li>
        <li>
          <strong>Клик</strong> — открыть · <strong>двойной клик</strong> — «Монтаж ▶» и прыжок
        </li>
        <li>
          <strong>вкл</strong> — в фильме · ↑↓ — порядок
        </li>
        <li>
          Между карточками: <strong>резкий</strong> или <strong>плавный …с</strong>
        </li>
        <li>
          <strong>＋ Сцена / Копия / Имя / Удалить / шаблон</strong>
        </li>
      </ul>
      <h4>Переход и превью</h4>
      <ul>
        <li>
          <strong>Резкий</strong> — мгновенно · <strong>Плавный</strong> — наплыв (длительность в секундах)
        </li>
        <li>
          В <strong>Монтаж…</strong>: полоска фильма, анимация A→B, кнопки превью середины / проиграть переход
        </li>
        <li>
          На Timeline при «Монтаж ▶» — жёлтые метки стыков; клик = прыжок в середину перехода
        </li>
        <li>
          <strong>Монтаж ▶</strong> — весь фильм на Timeline · <strong>Монтаж / экспорт…</strong> — один MP4/WebM
        </li>
      </ul>
    </>
  );
}

function DirectorSection() {
  return (
    <>
      <h3>Режиссёр — жесты</h3>
      <p>
        Панель под «Сцены и переходы». Анимация внутри <em>текущей</em> сцены.
      </p>
      <h4>Библиотека жестов</h4>
      <ul>
        <li>
          Блок <strong>Жесты / клипы</strong>: встроенные жесты и клипы проекта. Мозг режиссёра (раздел 2)
          сам пишет в промпт ремарки входа, маха и прыжка.
        </li>
        <li>
          <strong>▶</strong> — превью · <strong>Timeline</strong> — вставить на ползунок · <strong>Клип</strong> —
          открыть (при необходимости запечь).
        </li>
        <li>
          <strong>＋ Из позы</strong> — клип из текущей позы · <strong>Подготовить клипы</strong> — запечь встроенные.
        </li>
      </ul>
      <ol className="help-steps">
        <li>Выберите <strong>Актёр</strong>.</li>
        <li>Ползунок Timeline на нужное время.</li>
        <li>Жест: Стойка, Машет, Говорит, Радость, Прыжок, Удар…</li>
        <li>Действие встанет на это время; ▶ — проверка.</li>
      </ol>
      <p>
        <strong>Собрать Timeline</strong> — пересобрать вручную после правок списка действий. Если были ручные ключи
        (◆), будет вопрос.
      </p>
      <h4>Позы рига и IK</h4>
      <ul>
        <li>
          Справа в «Свойствах» — блок <strong>Позы</strong>: стойка, руки вверх, машет, сидит…
        </li>
        <li>
          Пресет = сдвиг от <strong>базовой позы</strong> (Bind). «Текущую как базовую» / «Сбросить».
        </li>
        <li>
          Инструмент <strong>IK (I)</strong>: зелёные точки на кистях/стопах — тяните к цели.
        </li>
        <li>Жесты Режиссёра крутятся поверх базовой позы и не затирают ваши пресеты.</li>
      </ul>
    </>
  );
}

function PathSection() {
  return (
    <>
      <h3>Путь мышкой</h3>
      <ol className="help-steps">
        <li>Актёр в Режиссёре · режим Ходьба или Бег.</li>
        <li>
          Инструмент <strong>Путь (W)</strong>.
        </li>
        <li>ЛКМ — линия пути (жёлтая).</li>
        <li>Отпустить — ходьба/бег к точке + обновление Timeline.</li>
      </ol>
      <ul>
        <li>Длительность ≈ длина пути (бег быстрее).</li>
        <li>Почти горизонтальный путь — ноги на земле.</li>
        <li>Ползунок = время старта движения.</li>
      </ul>
    </>
  );
}

function TimelineSection() {
  return (
    <>
      <h3>Timeline — сетка анимации</h3>
      <p>
        Нижняя панель. Высоту меняйте <strong>жёлтой полоской</strong> над Timeline.
      </p>
      <h4>Длина сцены</h4>
      <p>По умолчанию у сцены часто ~9 с. Любую длину (0,5…600 с) задайте так:</p>
      <ul>
        <li>
          В Timeline поле <strong>Длина</strong> (секунды) — например <strong>30</strong>.
        </li>
        <li>
          Или справа в «Свойства сцены» → <strong>Длина (с)</strong>.
        </li>
      </ul>
      <p className="hint">Шкала и ползунок растянутся. После жестов/пути длина может вырасти сама.</p>
      <h4>Управление</h4>
      <ul>
        <li>
          <strong>▶ / Пробел</strong> — пуск · <strong>■</strong> — в начало
        </li>
        <li>
          <strong>Цикл</strong> · <strong>Монтаж</strong> — весь фильм подряд
        </li>
        <li>
          <strong>Onion</strong> — призраки позы до/после ползунка
        </li>
        <li>
          Ключ ◆: <strong>Ctrl+C / Ctrl+V</strong>, Delete — удалить
        </li>
        <li>
          Ряд <strong>Вручную</strong>: ＋ Аудио / ＋ Реплика / Очистить звук
        </li>
        <li>Под ключом — кривая трека и кнопки easing</li>
        <li>
          Дорожки <strong>♪ аудио</strong> — клик → <strong>Del</strong> или × у названия / «Удалить»
        </li>
        <li>
          Дорожка <strong>Реплики</strong> — тяните / ±кадр / <strong>Sync к аудио</strong> / Del
        </li>
        <li>
          Полоска <strong>визем</strong> под репликой — авто / ручной Lip Sync; клик по сегменту меняет рот
        </li>
        <li>
          Индикатор <strong>Рот</strong> — текущая визема на playhead
        </li>
      </ul>
    </>
  );
}

function ScriptSection() {
  return (
    <>
      <h3>Промпт — мультик из текста</h3>
      <p>
        Кнопка <strong>Промпт</strong> открывает конструктор. Картинки и риги из текста <em>не рисуются
        нейросетью</em>: программа подставляет готовые файлы <strong>по именам</strong>.
      </p>
      <h4>Пошагово</h4>
      <ol className="help-steps">
        <li>
          Подготовьте героев: Огонёк / Морозко / Винтик подтянутся сами, или <strong>Загрузить rig</strong> и
          назовите персонажа так же, как в тексте.
        </li>
        <li>
          Нужны фоны и предметы? Накидайте PNG/JPG в <code>Assets/Backgrounds</code> и <code>Assets/Props</code>
          (кнопки «Фоны…» / «Предметы…» в Промпте). Сборка подберёт сама. Или <strong>Импорт PNG</strong>.
        </li>
        <li>
          Напишите промпт сами, нажмите <strong>Пример промпта</strong> или блок <strong>Мозг режиссёра</strong>:
          положить картинки/видео, придумать 3 варианта, или сразу <strong>Придумать и собрать</strong> (раздел
          <strong>2</strong>).
        </li>
        <li>
          Назначьте голоса (Piper / Voice Studio профили) и папку музыки («Выбрать папку…» или «Через MP3…» — берётся папка файла).
        </li>
        <li>
          Смотрите <strong>Чеклист готовности</strong>: ✓ ок, ! предупреждение, ✕ проблема.
        </li>
        <li>
          <strong>Собрать мультик по промпту</strong>. Потом правьте путём (W), жестами и Voice Studio.
        </li>
      </ol>
      <h4>Формат текста</h4>
      <pre className="help-pre">{`# Название мультика
Characters: Огонёк, Морозко, Винтик
Props: меч, шляпа
Genre: сказка
Atmosphere: солнечная поляна, дружелюбно

## Встреча
Огонёк: Эй, пойдём к Винтику!
Морозко: Давай, он давно дома.

## Домик
Огонёк: Мы на пороге!
Винтик: Скрип-привет! Я выхожу!`}</pre>
      <h4>Что означает каждая строка</h4>
      <ul>
        <li>
          <code># …</code> — название проекта.
        </li>
        <li>
          <code>Characters:</code> — герои через запятую (имена = риги).
        </li>
        <li>
          <code>Props:</code> — имена PNG из «Картинки».
        </li>
        <li>
          <code>## Название</code> — новая сцена.
        </li>
        <li>
          <code>Имя: реплика</code> — диалог.
        </li>
      </ul>
      <h4>Генератор сюжетов (мозг)</h4>
      <p>
        Стратегии MindCore работают только на ПК: равномерно, баланс, горячие/холодные шаблоны, покрытие и смесь.
        Режим <strong>Реклама</strong> — студийный фон, одна картинка на сцену по размеру, без чужих PNG из библиотеки.
        Подробный алгоритм — раздел <strong>2. Мозг режиссёра</strong>.
      </p>
      <h4>Ремарки жестов в тексте</h4>
      <p>
        Строка в скобках в сцене — указание сборщику, не реплика:{" "}
        <code>(входит слева, машет рукой, прыжок, ура, жми)</code>. Слова «смотри / к центру / жми» тоже включают
        мах, ходьбу и радость.
      </p>
      <h4>Частые ошибки</h4>
      <ul>
        <li>«Нет рига» — другое написание имени. Смотрите чеклист.</li>
        <li>«Нет PNG» — сначала Импорт PNG, потом Props.</li>
        <li>Пустая музыка — папка не выбрана или в ней нет mp3/wav. В диалоге папки Windows файлы не видны: нажмите «Через MP3…».</li>
        <li>
          Нет голоса — поставьте Voice Engine или Piper и назначьте герою.
        </li>
      </ul>
    </>
  );
}

function VoicesSection() {
  return (
    <>
      <h3>Голоса: локально, без оплаты</h3>
      <p>
        Все движки озвучки работают <strong>на вашем ПК</strong>. Платные облачные TTS/STT API в программе{" "}
        <strong>не используются</strong>. После первой загрузки моделей (Chatterbox / aligner) интернет для
        генерации не нужен.
      </p>
      <h4>Что выбрать</h4>
      <ul>
        <li>
          <strong>Voice Studio (Chatterbox)</strong> — лучший путь: свой тембр по референсу, Takes, авто Lip Sync.
          Кнопка <strong>Voice</strong> вверху. Подробно — раздел <strong>9</strong>.
        </li>
        <li>
          <strong>Piper (.onnx)</strong> — лёгкий запасной TTS для промпта / мастера.
        </li>
        <li>
          Готовый <strong>WAV/MP3</strong> — вкладка Аудио → Импорт → привязка к реплике.
          MP3 <strong>не</strong> подходит как «свой голос Piper»: туда нужен файл <code>.onnx</code>.
          Чтобы говорить вашим тембром из MP3 — Voice → референс.
        </li>
      </ul>
      <h4>Piper (опционально)</h4>
      <ol className="help-steps">
        <li>
          Один раз: <code>scripts\setup-piper.ps1</code> → модели в <code>Tools\piper</code>.
        </li>
        <li>
          Перезапустите программу. В Промпт → Озвучка появятся <strong>[Piper] …</strong>.
        </li>
        <li>
          Назначьте голос герою · скорость −10…+10 · <strong>▶ Прослушать</strong>.
        </li>
        <li>
          Свой Piper: <code>имя.onnx</code> + <code>имя.onnx.json</code> → «Добавить .onnx…» (не MP3).
        </li>
      </ol>
    </>
  );
}

function VoiceStudioSection() {
  return (
    <>
      <h3>Voice Studio — создание и использование</h3>
      <p>
        <strong>Voice</strong> в верхней панели открывает студию. Движок —{" "}
        <strong>Chatterbox Multilingual</strong> внутри папки <code>voice-engine</code> (Python/PyTorch). Это не
        облачный сервис: запросы не уходят на платные API.
      </p>

      <h4>Установка движка (один раз)</h4>
      <ol className="help-steps">
        <li>
          Запустите <code>voice-engine\setup-voice-engine.ps1</code> из корня проекта (нужен Python 3.11 и желательно
          NVIDIA GPU).
        </li>
        <li>
          Скрипт создаст <code>voice-engine\.venv</code>, поставит PyTorch и Chatterbox.
        </li>
        <li>
          Первый запуск модели может скачать веса в кэш Hugging Face на диске. Дальше — офлайн.
        </li>
        <li>
          Запускайте студию через <code>release\START-KRX.bat</code> как обычно — Electron сам общается с worker.
        </li>
      </ol>

      <h4>Создание профиля голоса</h4>
      <ol className="help-steps">
        <li>
          Откройте <strong>Voice</strong> → блок профилей → создайте профиль с понятным именем (например «Огонёк»).
        </li>
        <li>
          Добавьте <strong>референс WAV</strong>: чистая речь 3–10 секунд, один говорящий, без музыки и эха.
          Файлы лежат в <code>Voices\&lt;Имя&gt;\References\</code>.
        </li>
        <li>
          Выберите язык (русский и др.), при необходимости подстройте экспрессию / паузы в параметрах генерации.
        </li>
        <li>
          Назначьте профиль персонажу проекта (или выберите актёра сцены перед генерацией).
        </li>
      </ol>

      <h4>Генерация реплики (Take)</h4>
      <ol className="help-steps">
        <li>Введите текст реплики на нужном языке.</li>
        <li>
          Нажмите <strong>Сгенерировать</strong> — получите WAV в <code>Audio/Dialogue/…</code> и Take в списке.
        </li>
        <li>
          Можно сделать несколько Takes одного текста и выбрать лучший.
        </li>
        <li>
          <strong>▶</strong> — прослушать. Не нравится — смените референс / параметры и сгенерируйте снова.
        </li>
        <li>
          <strong>На Timeline</strong> — положит аудио + реплику на текущий playhead (сцена удлинится при необходимости).
        </li>
      </ol>

      <h4>Связь с актёром и ртом</h4>
      <ul>
        <li>Take привязан к персонажу / актёру — на сцене рот двигается у нужного героя.</li>
        <li>
          После генерации включите <strong>Авто Lip Sync</strong> (раздел 10) или нажмите Generate в блоке Lip Sync.
        </li>
        <li>
          В инспекторе актёра настройте <strong>Mouth Set</strong>: выкл / Simple / Basic / Advanced и сглаживание.
        </li>
      </ul>

      <h4>Советы по качеству</h4>
      <ul>
        <li>Референс лучше короткой чистой фразы на том же языке, что и реплика.</li>
        <li>Длинный текст можно бить на несколько Takes и стыковать на Timeline.</li>
        <li>
          Если worker «спит» — дождитесь статуса Ready; тяжёлая модель грузится в VRAM один раз и переиспользуется.
        </li>
        <li>
          Без GPU генерация возможна на CPU, но заметно медленнее.
        </li>
      </ul>
    </>
  );
}

function LipSyncSection() {
  return (
    <>
      <h3>Автоматический Lip Sync</h3>
      <p>
        Система <strong>не угадывает</strong> слова из облака. Она берёт <em>уже известный текст реплики</em> и WAV
        Take и локально выравнивает фонемы по времени (forced alignment). Результат — куски (cues) с виземами рта на
        Timeline. Платных STT API нет.
      </p>

      <h4>Что нужно заранее</h4>
      <ol className="help-steps">
        <li>
          Установленный Voice Engine (тот же <code>voice-engine\.venv</code>; aligner ставится вместе со скриптом
          setup).
        </li>
        <li>Готовый Take с текстом и WAV (из Voice Studio или импорт с тем же текстом).</li>
        <li>
          У актёра настроен <strong>Mouth Set</strong> (хотя бы Simple) — иначе рот не переключит спрайты/масштаб.
        </li>
      </ol>

      <h4>Как сгенерировать рот</h4>
      <ol className="help-steps">
        <li>
          В Voice Studio откройте Take → блок <strong>Auto Lip Sync</strong>.
        </li>
        <li>
          Включите автопосле генерации голоса (галочка) или нажмите <strong>Generate / Regenerate</strong>.
        </li>
        <li>
          Дождитесь статуса Ready — cues появятся у реплики и полоской на Timeline.
        </li>
        <li>
          <strong>Preview</strong> — проиграть сцену и смотреть рот на playhead.
        </li>
        <li>
          <strong>Clear</strong> — убрать cues с реплики (звук останется).
        </li>
        <li>
          <strong>Batch</strong> («сгенерировать недостающие») — пройтись по Takes сцены без lip-sync.
        </li>
      </ol>

      <h4>Mouth Set (инспектор актёра)</h4>
      <ul>
        <li>
          <strong>Выкл</strong> — авто-рот не применяется.
        </li>
        <li>
          <strong>Simple</strong> — базовые открытие/закрытие и простые формы.
        </li>
        <li>
          <strong>Basic / Advanced</strong> — больше визем (A, E, I, O, U, MBP, FV, REST…).
        </li>
        <li>
          Сглаживание смягчает резкие скачки между формами.
        </li>
        <li>
          Если текст или WAV Take изменились — данные помечаются как устаревшие; нажмите Regenerate.
        </li>
      </ul>

      <h4>Правка вручную на Timeline</h4>
      <ul>
        <li>Под репликой видна цветная полоска визем.</li>
        <li>Клик по сегменту — сменить визему (если рот «плывёт» на одном слоге).</li>
        <li>
          Тяните реплику / Sync к аудио — cues едут вместе с текстом по времени сцены.
        </li>
        <li>
          Индикатор <strong>Рот</strong> показывает текущую форму на ползунке.
        </li>
      </ul>

      <h4>Как это устроено (кратко)</h4>
      <ul>
        <li>
          Локальный пакет <strong>ctc-forced-aligner</strong> + модель выравнивания в кэше на диске.
        </li>
        <li>
          Worker команды: align / status — через Electron IPC, без сети во время работы.
        </li>
        <li>
          Модель выравнивания может иметь лицензию CC-BY-NC (бесплатно для некоммерции) — это не «платный API», но
          для коммерции проверьте лицензию модели отдельно.
        </li>
        <li>
          Губы/брови/эмоции лица и Whisper-распознавание <em>не</em> входят в эту систему — только рот по тексту+WAV.
        </li>
      </ul>
    </>
  );
}

function AudioSection() {
  return (
    <>
      <h3>Аудио, музыка и Timeline</h3>
      <h4>Где настраивать</h4>
      <ul>
        <li>
          <strong>Voice</strong> — Chatterbox, Takes, Auto Lip Sync.
        </li>
        <li>
          <strong>Промпт → Озвучка</strong> — Chatterbox / Piper для сборки из текста (робот Windows отключён).
        </li>
        <li>
          Справа вкладка <strong>Аудио</strong> — импорт, привязка к реплике, субтитры, старый фонетический lip-sync.
        </li>
        <li>
          <strong>Timeline</strong> — волна, реплики, Sync, Del по блоку, «Очистить звук».
        </li>
      </ul>
      <h4>Ручная сборка кадра</h4>
      <ul>
        <li>
          <strong>Актёр</strong> — слева «＋ Добавить актёра».
        </li>
        <li>
          <strong>Фон / предмет</strong> — Библиотека: «Сделать фоном» / «＋ Предмет на сцену» (или двойной клик).
        </li>
        <li>
          <strong>Звук</strong> — Timeline «＋ Аудио» или справа вкладка Аудио.
        </li>
      </ul>
      <h4>Точная привязка реплики к звуку</h4>
      <ol className="help-steps">
        <li>У реплики выберите «Связанное аудио».</li>
        <li>
          На Timeline: 🔗 = совпали старт/длина, ⚠ = съехали.
        </li>
        <li>
          <strong>Sync к аудио</strong> выравнивает реплику по дорожке.
        </li>
        <li>
          Тяните блок мышью; <strong>Shift</strong> — реплика и аудио вместе. ±кадр — на один кадр.
        </li>
      </ol>
      <h4>Два режима «рта»</h4>
      <ul>
        <li>
          <strong>Авто Lip Sync (Voice Studio)</strong> — точное выравнивание по тексту+WAV (раздел 10). Рекомендуется.
        </li>
        <li>
          <strong>Аудио → Lip Sync (фонемы)</strong> — упрощённая оценка из текста и гейт по амплитуде WAV. Запасной
          вариант без aligner.
        </li>
      </ul>
      <h4>Музыка</h4>
      <p>
        В промпте укажите локальную папку — треки подберутся по настроению сцены. Или импортируйте вручную во вкладке
        Аудио (mp3/wav/ogg с диска).
      </p>
    </>
  );
}

function ExportSection() {
  return (
    <>
      <h3>Экспорт</h3>
      <ol className="help-steps">
        <li>
          <strong>Экспорт</strong> — кадр, PNG-последовательность или видео <em>текущей</em> сцены.
        </li>
        <li>
          <strong>Монтаж…</strong> — видео <em>всего</em> фильма (включённые сцены + переход).
        </li>
        <li>
          Формат и папка — в «Экспорт». FFmpeg встроен, интернет не нужен.
        </li>
      </ol>
      <h4>Пресеты YouTube / Shorts</h4>
      <ul>
        <li>
          <strong>YouTube</strong> — Full HD 1920×1080, 16:9, MP4/H.264
        </li>
        <li>
          <strong>Shorts</strong> — 1080×1920, 9:16
        </li>
        <li>
          <strong>Квадрат</strong> / <strong>HD 720p</strong> — соцсети и черновик
        </li>
      </ul>
    </>
  );
}

function HotkeysSection() {
  return (
    <>
      <h3>Клавиши</h3>
      <table className="help-table">
        <tbody>
          <tr>
            <td>F1</td>
            <td>Помощь</td>
          </tr>
          <tr>
            <td>Пробел</td>
            <td>Пуск / пауза</td>
          </tr>
          <tr>
            <td>Esc</td>
            <td>Закрыть панель / скрыть ошибку</td>
          </tr>
          <tr>
            <td>Ctrl+S</td>
            <td>Сохранить</td>
          </tr>
          <tr>
            <td>Ctrl+Shift+S</td>
            <td>Сохранить как</td>
          </tr>
          <tr>
            <td>Ctrl+Z / Y</td>
            <td>Назад / вперёд</td>
          </tr>
          <tr>
            <td>W</td>
            <td>Путь</td>
          </tr>
          <tr>
            <td>G</td>
            <td>Двигать актёра</td>
          </tr>
          <tr>
            <td>V / R / S</td>
            <td>Часть / поворот / масштаб</td>
          </tr>
          <tr>
            <td>P / K / I / H</td>
            <td>Опора / сокет / IK / сдвиг вида</td>
          </tr>
          <tr>
            <td>Ctrl+C / V</td>
            <td>Копия / вставка ключа Timeline</td>
          </tr>
          <tr>
            <td>Delete</td>
            <td>Удалить ключ ◆, аудио/реплику на Timeline или объект со сцены</td>
          </tr>
        </tbody>
      </table>
      <h4>Ошибки и Undo</h4>
      <ul>
        <li>Красная строка внизу — ошибка; Esc или клик скрывает.</li>
        <li>Экспорт пишет понятный текст + «Что делать» и путь к журналу FFmpeg.</li>
        <li>Быстрые правки с одним названием склеиваются в один шаг Undo (~1 с).</li>
      </ul>
    </>
  );
}

const SECTIONS: HelpSection[] = [
  {
    id: "overview",
    title: "Обзор",
    searchText:
      "обзор программа локально облако f1 помощь промпт piper chatterbox voice studio lip sync монтаж экспорт без api мозг реклама мультик",
    body: OverviewSection,
  },
  {
    id: "workflow",
    title: "1. С чего начать",
    searchText:
      "с чего начать сцены актёры фон режиссёр путь монтаж сохранить промпт предметы библиотека автосейв demobot voice цвет градиент палитра пресет мозг реклама",
    body: WorkflowSection,
  },
  {
    id: "brain",
    title: "2. Мозг режиссёра",
    searchText:
      "мозг режиссёра mindcore алгоритм шаги реклама мультик ролик картинки видео jpg mp4 png жесты входит машет прыжок хук продукт призыв локально без облака без нейросети ffmpeg кадр props",
    body: BrainSection,
  },
  {
    id: "scenes",
    title: "3. Сцены и переходы",
    searchText: "сцены переходы монтаж резкий плавный порядок карточки экспорт превью xf",
    body: ScenesSection,
  },
  {
    id: "director",
    title: "4. Режиссёр",
    searchText: "режиссёр жесты машет говорит радость прыжок timeline позы ik клипы",
    body: DirectorSection,
  },
  {
    id: "path",
    title: "5. Путь мышкой",
    searchText: "путь мышка ходьба бег w земля линия",
    body: PathSection,
  },
  {
    id: "timeline",
    title: "6. Timeline и длина",
    searchText: "timeline шкала длина секунды цикл монтаж ключи виземы рот lip sync",
    body: TimelineSection,
  },
  {
    id: "script",
    title: "7. Промпт",
    searchText: "промпт сценарий characters props риг png музыка чеклист мозг реклама жесты ремарка",
    body: ScriptSection,
  },
  {
    id: "voices",
    title: "8. Голоса (локально)",
    searchText: "голоса озвучка piper onnx chatterbox mp3 референс локально бесплатно без api",
    body: VoicesSection,
  },
  {
    id: "voiceStudio",
    title: "9. Voice Studio",
    searchText:
      "voice studio chatterbox профиль референс take генерация wav timeline setup-voice-engine создание голоса",
    body: VoiceStudioSection,
  },
  {
    id: "lipSync",
    title: "10. Авто Lip Sync",
    searchText:
      "lip sync рот виземы mouth set alignment ctc forced aligner generate regenerate preview batch cues",
    body: LipSyncSection,
  },
  {
    id: "audio",
    title: "11. Аудио и музыка",
    searchText: "аудио музыка реплика импорт sync волна timeline фонемы",
    body: AudioSection,
  },
  {
    id: "export",
    title: "12. Экспорт",
    searchText: "экспорт mp4 webm ffmpeg youtube shorts",
    body: ExportSection,
  },
  {
    id: "hotkeys",
    title: "13. Клавиши",
    searchText: "клавиши f1 пробел ctrl сохранить путь ik",
    body: HotkeysSection,
  },
];

function normalizeQuery(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

function sectionMatches(section: HelpSection, query: string): boolean {
  if (!query) return true;
  const blob = `${section.title} ${section.searchText}`.toLowerCase();
  return query.split(" ").filter(Boolean).every((token) => blob.includes(token));
}

export function HelpPanel() {
  const editor = useEditor();
  const [section, setSection] = useState<HelpSectionId>("overview");
  const [query, setQuery] = useState("");
  const normalized = normalizeQuery(query);

  const visible = useMemo(
    () => SECTIONS.filter((item) => sectionMatches(item, normalized)),
    [normalized],
  );

  useEffect(() => {
    if (!normalized) return;
    if (!visible.some((item) => item.id === section) && visible[0]) {
      setSection(visible[0].id);
    }
  }, [normalized, section, visible]);

  if (!editor.helpPanelOpen) return null;

  const active = SECTIONS.find((item) => item.id === section) ?? SECTIONS[0]!;
  const Body = active.body;

  return (
    <div
      className="export-modal-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) editor.setHelpPanelOpen(false);
      }}
    >
      <section className="export-modal help-modal" role="dialog" aria-label="Справка">
        <header className="export-modal-head">
          <div>
            <strong>Помощь — KRX Cartoon Studio</strong>
            <small>Локально · без платных API · F1</small>
          </div>
          <button type="button" onClick={() => editor.setHelpPanelOpen(false)}>
            Закрыть
          </button>
        </header>

        <div className="export-modal-body help-layout">
          <nav className="help-nav" aria-label="Разделы справки">
            <label className="help-search">
              <span className="sr-only">Поиск по справке</span>
              <input
                type="search"
                placeholder="Поиск: Voice, Lip Sync, монтаж…"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                autoFocus
              />
            </label>
            {visible.length === 0 && <p className="hint">Ничего не найдено.</p>}
            {visible.map((item) => (
              <button
                key={item.id}
                type="button"
                className={section === item.id ? "active" : ""}
                onClick={() => setSection(item.id)}
              >
                {item.title}
              </button>
            ))}
          </nav>
          <article className="help-content inspector-section">
            {normalized && (
              <p className="hint help-search-meta">
                Найдено разделов: {visible.length}
                {visible.length ? ` · сейчас: ${active.title}` : ""}
              </p>
            )}
            <Body />
          </article>
        </div>
      </section>
    </div>
  );
}
