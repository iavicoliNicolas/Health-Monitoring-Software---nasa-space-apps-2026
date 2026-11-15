/**
 * Panel de cámara para la comparación de hinchazón facial.
 * El video vive solo en el elemento <video>. Al cortar la cámara se sueltan
 * los tracks y no queda ningún frame. localStorage recibe tres índices.
 */
(function () {
    'use strict';

    var SCRIPT_BASE = (document.currentScript && document.currentScript.src) || window.location.href;
    var LOCAL_SOURCES = {
        vision: new URL('../vendor/mediapipe/vision_bundle.mjs', SCRIPT_BASE).href,
        wasm: new URL('../vendor/mediapipe/wasm', SCRIPT_BASE).href,
        model: new URL('../vendor/mediapipe/face_landmarker.task', SCRIPT_BASE).href
    };
    var CDN_SOURCES = {
        vision: 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/+esm',
        wasm: 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm',
        model: 'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task'
    };

    document.addEventListener('DOMContentLoaded', function () {
        var edema = window.FacialEdema;
        var video = document.getElementById('edemaVideo');
        var idle = document.getElementById('edemaIdle');
        var deltaEl = document.getElementById('edemaDelta');
        var deltaLabel = document.getElementById('edemaDeltaLabel');
        var cheekEl = document.getElementById('edemaCheek');
        var jawEl = document.getElementById('edemaJaw');
        var roundEl = document.getElementById('edemaRound');
        var baselineEl = document.getElementById('edemaBaselineDate');
        var daysEl = document.getElementById('edemaDays');
        var chartEl = document.getElementById('edemaChart');
        var historyEl = document.getElementById('edemaHistory');
        var statusEl = document.getElementById('edemaStatus');
        var cameraBtn = document.getElementById('edemaCameraBtn');
        var captureBtn = document.getElementById('edemaCaptureBtn');
        var resetBtn = document.getElementById('edemaResetBtn');
        if (!edema || !video || !cameraBtn) return;

        try {
            edema.selfTest();
        } catch (err) {
            statusEl.textContent = 'The swelling calculation failed its internal test: ' + err.message;
            cameraBtn.disabled = true;
            return;
        }

        var store = edema.loadStore();
        var buffer = [];
        var stream = null;
        var landmarker = null;
        var running = false;
        var raf = 0;
        var starting = false;

        function formatPct(value) {
            var sign = value > 0 ? '+' : '';
            return sign + value.toFixed(1) + '%';
        }

        function setStatus(text) {
            statusEl.textContent = text;
        }

        function paintReadout(sample, label) {
            if (!store.baseline || !sample) {
                deltaEl.textContent = store.baseline ? '0.0%' : '—';
                deltaEl.className = 'edema-delta';
                deltaLabel.textContent = label;
                cheekEl.textContent = '—';
                jawEl.textContent = '—';
                roundEl.textContent = '—';
                return;
            }
            var deltas = edema.componentDeltas(sample, store.baseline);
            var drift = edema.meanDelta(deltas);
            deltaEl.textContent = formatPct(drift);
            deltaEl.className = 'edema-delta ' + edema.band(drift);
            deltaLabel.textContent = label;
            cheekEl.textContent = formatPct(deltas.cheek);
            jawEl.textContent = formatPct(deltas.jaw);
            roundEl.textContent = formatPct(deltas.roundness);
        }

        function renderStore() {
            if (!store.baseline) {
                baselineEl.textContent = 'Day 1: not set';
                daysEl.textContent = '';
                captureBtn.textContent = 'SET DAY 1';
            } else {
                baselineEl.textContent = 'Day 1: ' + store.baseline.day;
                var last = store.samples[store.samples.length - 1];
                daysEl.textContent = last
                    ? edema.daysBetween(store.baseline.day, last.day) + ' days of drift'
                    : 'The series starts on the next capture, on another day';
                captureBtn.textContent = 'SAVE TODAY';
            }

            var points = edema.series(store);
            chartEl.innerHTML = '';
            if (!points.length) {
                chartEl.hidden = true;
            } else {
                chartEl.hidden = false;
                points.slice(-30).forEach(function (point) {
                    var bar = document.createElement('span');
                    bar.className = 'edema-bar ' + edema.band(point.delta);
                    var magnitude = Math.min(22, Math.abs(point.delta) / 8 * 22);
                    bar.style.height = Math.max(2, magnitude) + 'px';
                    if (point.delta < 0) bar.classList.add('down');
                    bar.title = point.day + ' · ' + formatPct(point.delta);
                    chartEl.appendChild(bar);
                });
            }

            historyEl.innerHTML = '';
            points.slice().reverse().slice(0, 6).forEach(function (point) {
                var row = document.createElement('div');
                row.className = 'edema-history-row';
                var day = document.createElement('span');
                day.textContent = point.day + ' · day ' + point.days;
                var value = document.createElement('strong');
                value.textContent = formatPct(point.delta);
                value.className = edema.band(point.delta);
                row.appendChild(day);
                row.appendChild(value);
                historyEl.appendChild(row);
            });

            if (!running) {
                var latest = store.samples[store.samples.length - 1];
                if (latest) paintReadout(latest, 'Last saved capture vs day 1');
                else paintReadout(null, store.baseline ? 'Baseline set' : 'No baseline');
            }
        }

        function renderLive() {
            var live = edema.medianSample(buffer);
            captureBtn.disabled = !live;
            if (!live) {
                if (store.baseline) {
                    paintReadout(null, 'Looking for a face, straight on');
                    deltaEl.textContent = '…';
                }
                return;
            }
            paintReadout(live, store.baseline ? 'Live reading, not saved yet' : 'Ready to set day 1');
        }

        async function createLandmarkerFrom(sources) {
            var vision = await import(sources.vision);
            var fileset = await vision.FilesetResolver.forVisionTasks(sources.wasm);
            var options = {
                baseOptions: { modelAssetPath: sources.model },
                runningMode: 'VIDEO',
                numFaces: 1
            };
            try {
                options.baseOptions.delegate = 'GPU';
                return await vision.FaceLandmarker.createFromOptions(fileset, options);
            } catch (gpuError) {
                options.baseOptions.delegate = 'CPU';
                return await vision.FaceLandmarker.createFromOptions(fileset, options);
            }
        }

        async function ensureLandmarker() {
            if (landmarker) return landmarker;
            setStatus('Loading local Face Landmarker (offline mode)…');
            try {
                landmarker = await createLandmarkerFrom(LOCAL_SOURCES);
                return landmarker;
            } catch (localErr) {
                console.warn('[FacialEdema] Fallback a CDN remoto:', localErr);
                setStatus('Loading Face Landmarker (CDN fallback)…');
                landmarker = await createLandmarkerFrom(CDN_SOURCES);
                return landmarker;
            }
        }

        function tick() {
            if (!running) return;
            if (video.readyState >= 2 && landmarker) {
                var result = landmarker.detectForVideo(video, performance.now());
                var landmarks = result.faceLandmarks && result.faceLandmarks[0];
                var sample = landmarks ? edema.measure(landmarks) : null;
                if (sample) {
                    buffer.push(sample);
                    if (buffer.length > 24) buffer.shift();
                }
                idle.hidden = true;
                renderLive();
                if (!edema.medianSample(buffer)) {
                    setStatus('Look straight ahead, face at rest and well lit.');
                } else if (!store.baseline) {
                    setStatus('First capture: this becomes day 1. The video is not stored.');
                } else {
                    setStatus('The live reading does not enter the series until the day is saved.');
                }
            }
            raf = requestAnimationFrame(tick);
        }

        function stopCamera() {
            running = false;
            cancelAnimationFrame(raf);
            buffer = [];
            if (stream) {
                stream.getTracks().forEach(function (track) { track.stop(); });
                stream = null;
            }
            video.srcObject = null;
            idle.hidden = false;
            cameraBtn.textContent = 'START CAMERA';
            captureBtn.disabled = true;
            renderStore();
        }

        async function startCamera() {
            if (running || starting) return;
            starting = true;
            try {
                await ensureLandmarker();
                stream = await navigator.mediaDevices.getUserMedia({
                    audio: false,
                    video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } }
                });
                video.srcObject = stream;
                await video.play();
                running = true;
                buffer = [];
                cameraBtn.textContent = 'STOP CAMERA';
                captureBtn.disabled = true;
                setStatus('Local camera on. No frame leaves this machine.');
                raf = requestAnimationFrame(tick);
            } catch (err) {
                stopCamera();
                if (err && err.name === 'NotAllowedError') {
                    setStatus('The browser blocked the camera. Allow it for this page.');
                } else if (err && err.name === 'NotFoundError') {
                    setStatus('No camera is available.');
                } else {
                    setStatus('Could not open the camera or the model. Open the cockpit from http://localhost:8080/web/index.html (run.bat).');
                }
            } finally {
                starting = false;
            }
        }

        cameraBtn.addEventListener('click', function () {
            if (running) stopCamera();
            else startCamera();
        });

        captureBtn.addEventListener('click', function () {
            var sample = edema.medianSample(buffer);
            if (!sample) return;
            var result = edema.applyCapture(store, sample, new Date());
            if (result.kind === 'same-day') {
                setStatus('Day 1 is already set today. The next capture, on another day, enters the series.');
                return;
            }
            store = result.store;
            edema.saveStore(store);
            renderStore();
            if (result.kind === 'baseline') {
                setStatus('Day 1 saved. Only three indexes remain in this browser.');
            } else {
                var last = store.samples[store.samples.length - 1];
                var drift = edema.meanDelta(edema.componentDeltas(last, store.baseline));
                setStatus('Capture for ' + last.day + ' saved: ' + formatPct(drift) + ' versus day 1.');
            }
        });

        resetBtn.addEventListener('click', function () {
            if (!store.baseline && !store.samples.length) return;
            if (!window.confirm('Delete day 1 and the whole swelling series on this machine?')) return;
            store = edema.clearStore();
            renderStore();
            setStatus('Baseline cleared. The next capture becomes day 1 again.');
        });

        document.addEventListener('visibilitychange', function () {
            if (document.hidden && running) stopCamera();
        });

        renderStore();
    });
})();
