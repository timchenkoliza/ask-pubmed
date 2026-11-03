import { AnimatePresence, motion, useAnimationControls, useReducedMotion, useScroll, useTransform } from 'framer-motion';
import { useEffect, useMemo } from 'react';
import type { MassSpec, Params, Scenario, ShapeSpec, SpanKind } from '../data/types';
import type { State } from '../state/machine';
import type { LayoutMode } from '../hooks';
import { GeomKind, ShapeMode, anchorFor, orbitDots, shapeGeom, toContainer } from '../lib/geom';
import { Composition, compose } from '../lib/compose';

/* Evidence Shape: абстрактная форма из частей запроса.
   Холодная масса: состояние. Тёплая: фактор или вмешательство. Светлое свечение: исход.
   Мелкие точки на орбите: ограничения (типы исследований, период, полный текст).
   Форма живёт только в слое сцены: на ней нет текста и данных, она подсказывает структуру. */

export interface SeedSrc { kind: SpanKind; x: number; y: number }

const AMBIENT: ShapeSpec = {
  kind: 'cluster',
  orbitBase: 30,
  masses: [
    { id: 'a-1', bind: '', tone: 'cold', x: 370, y: 400, rx: 190, ry: 156, rot: -14 },
    { id: 'a-2', bind: '', tone: 'cold2', x: 320, y: 340, rx: 122, ry: 100, rot: 22 },
    { id: 'a-3', bind: '', tone: 'lilac', x: 470, y: 450, rx: 96, ry: 78, rot: 8 },
  ],
};

const FX: Record<ShapeMode, { filter: string; opacity: number }> = {
  ambient: { filter: 'blur(1px) saturate(0.85)', opacity: 0.62 },
  assemble: { filter: 'blur(0px) saturate(1.05)', opacity: 1 },
  search: { filter: 'blur(0px) saturate(1.05)', opacity: 1 },
  calm: { filter: 'blur(7px) saturate(0.55)', opacity: 0.56 },
};

const SEARCH_LANES = [
  { key: 'exact', x: -170, y: -8, s: 0.58, delay: 0, d: 'M400 400 Q 300 300 230 392' },
  { key: 'broad', x: 0, y: -150, s: 0.58, delay: 0.09, d: 'M400 400 Q 400 300 400 252' },
  { key: 'fallback', x: 170, y: -8, s: 0.58, delay: 0.18, d: 'M400 400 Q 500 300 570 392' },
];

const lockPath = (
  <>
    <rect width="18" height="11" x="3" y="11" rx="2" ry="2" />
    <path d="M7 11V7a5 5 0 0 1 10 0v4" />
  </>
);

interface Props {
  w: number;
  h: number;
  layout: LayoutMode;
  mode: ShapeMode;
  geomKind: GeomKind;
  route: boolean;
  scenario: Scenario | null;
  params: Params | null;
  changed: State['changed'];
  jolt: number;
  seeds: SeedSrc[];
  seedRun: number;
  shiftX: number;
  routeLabels: { a: string; b: string } | null;
  /** Композиция под тип выдачи и представление. */
  composition: Composition;
  /** Счётчик смен представления: форма коротко вспыхивает и снова затихает. */
  pulse: number;
  /** Подсвеченный вариант уточнения; -1: ни один. */
  hot: number;
}

const gradientStops: Record<MassSpec['tone'], [string, number][]> = {
  cold: [['#7275ff', 0.95], ['#5759ef', 0.6], ['#3a3dc0', 0]],
  cold2: [['#898bff', 0.9], ['#7275ff', 0.45], ['#5759ef', 0]],
  lilac: [['#d9d8ff', 0.8], ['#898bff', 0.4], ['#7275ff', 0]],
  warm: [['#ffa36b', 0.95], ['#ff6b4a', 0.5], ['#e0483a', 0]],
  warm2: [['#ffd25e', 0.95], ['#ffb03b', 0.45], ['#ff8a1f', 0]],
  inner: [['#ffc2ad', 0.95], ['#ff8a70', 0.55], ['#e0483a', 0]],
  soft: [['#ffffff', 0.5], ['#b8bac4', 0.2], ['#b8bac4', 0]],
};

export function EvidenceShape(p: Props) {
  const reduced = !!useReducedMotion();
  const mobile = p.layout === 'mobile';
  const spec = p.scenario ? p.scenario.shape : AMBIENT;
  const g = useMemo(() => shapeGeom(p.w, p.h, mobile, p.geomKind, p.shiftX), [p.w, p.h, mobile, p.geomKind, p.shiftX]);
  const orbit = useMemo(() => orbitDots(p.params, spec.orbitBase), [p.params, spec.orbitBase]);

  const t = useMemo(() => compose(p.composition, mobile), [p.composition, mobile]);
  const fieldOn = p.composition.kind !== 'none' && p.mode === 'calm';
  /* Читаем, а не смотрим на сцену: объекты — фон. В цитатах строки шире текста, поэтому их ещё тише. */
  const calmO = (p.composition.kind === 'quotes' ? 0.6 : 1) * (p.layout === 'mobile' ? 0.16 : 0.28);

  const { scrollY } = useScroll();
  const fade = useTransform(scrollY, [0, 520], [1, 0.28]);

  /* Эффекты слоя: ambient / assemble / search / calm и короткая «вспышка» при правке. */
  const fx = useAnimationControls();
  useEffect(() => {
    const t = FX[p.mode];
    fx.start({ ...t, transition: { duration: reduced ? 0.01 : p.mode === 'calm' ? 1.1 : 0.7, ease: 'easeOut' } });
  }, [p.mode, reduced, fx]);
  useEffect(() => {
    if (!p.changed || p.mode !== 'calm' || reduced) return;
    let live = true;
    (async () => {
      await fx.start({ filter: 'blur(5px) saturate(0.95)', opacity: 0.88, transition: { duration: 0.22, ease: 'easeOut' } });
      if (live) await fx.start({ ...FX.calm, transition: { duration: 1.0, ease: 'easeOut' } });
    })();
    return () => {
      live = false;
    };
  }, [p.changed?.n]); // eslint-disable-line react-hooks/exhaustive-deps

  /* Слой объектов: виден только пока врач читает выдачу; при смене представления вспыхивает и затихает. */
  const field = useAnimationControls();
  useEffect(() => {
    field.start(
      fieldOn
        ? { opacity: calmO, filter: 'blur(0.6px)', transition: { duration: reduced ? 0.01 : 0.8 } }
        : { opacity: 0, filter: 'blur(6px)', transition: { duration: reduced ? 0.01 : 0.35 } },
    );
  }, [fieldOn, reduced, field, calmO]);
  useEffect(() => {
    if (!p.pulse || reduced || !fieldOn) return;
    let live = true;
    (async () => {
      await Promise.all([
        field.start({ opacity: 1, filter: 'blur(0px)', transition: { duration: 0.25, ease: 'easeOut' } }),
        fx.start({ filter: 'blur(3px) saturate(0.9)', opacity: 0.85, transition: { duration: 0.25, ease: 'easeOut' } }),
      ]);
      if (live) {
        field.start({ opacity: calmO, filter: 'blur(0.6px)', transition: { duration: 1.3, ease: 'easeOut' } });
        fx.start({ ...FX.calm, transition: { duration: 1.3, ease: 'easeOut' } });
      }
    })();
    return () => {
      live = false;
    };
  }, [p.pulse]); // eslint-disable-line react-hooks/exhaustive-deps

  /* Встряска: форма чуть смещается и возвращается. */
  const jolt = useAnimationControls();
  useEffect(() => {
    if (!p.jolt || reduced) return;
    jolt.start({ x: [0, 16, -9, 0], rotate: [0, 2.2, -1.2, 0], transition: { duration: 0.55, ease: 'easeOut' } });
  }, [p.jolt]); // eslint-disable-line react-hooks/exhaustive-deps

  const active = (bind: string) => {
    if (!bind || !p.params) return true;
    const c = p.params.concepts.find((x) => x.id === bind);
    return c ? c.active : true;
  };
  const hit = (id: string) => (p.changed && p.changed.id === id ? p.changed.n : 0);

  const spring = reduced ? { duration: 0.01 } : { type: 'spring' as const, stiffness: 150, damping: 15 };
  const move = reduced ? { duration: 0.01 } : { type: 'spring' as const, stiffness: 88, damping: 15, mass: 1 };
  /* Размеры (радиус, ширина, высота) двигаем без пружины: перелёт через ноль даёт отрицательное значение, а SVG его отвергает. */
  const size = reduced ? { duration: 0.01 } : { type: 'tween' as const, duration: 0.9, ease: [0.22, 0.8, 0.2, 1] as [number, number, number, number] };
  const assembling = p.mode === 'assemble';

  const searching = p.mode === 'search';
  const mainOpacity = p.route ? 0 : searching ? 0.22 : 1;

  /* Семена из слов запроса летят к своим частям формы. */
  const used = { n: 0 };
  const seeds = p.mode === 'assemble' && !reduced && p.scenario
    ? p.seeds.map((s, i) => {
        const a = toContainer(g, anchorFor(s.kind, spec, orbit, used));
        return { ...s, to: a, i };
      })
    : [];

  const laneDx = mobile ? 118 : 190;
  const laneScale = mobile ? 0.5 : 0.6;
  const lane = (key: string, x: number, y: number, label: string) => {
    const pt = toContainer(g, { x: 400 + x, y: 640 });
    return { key, label, ...pt, y: pt.y + y };
  };
  const labels = p.route && p.routeLabels
    ? [lane('a', -laneDx, 0, p.routeLabels.a), lane('b', laneDx, 0, p.routeLabels.b)]
    : [];

  return (
    <div className="stage" aria-hidden="true">
      <motion.div className="stage-fade" style={{ opacity: fade }}>
        <motion.div
          className="shape-box"
          initial={false}
          animate={{ x: g.cx - 400, y: g.cy - 400, scale: (g.size / 800) * g.scale }}
          transition={reduced ? { duration: 0.01 } : { type: 'spring', stiffness: 70, damping: 18, mass: 1.1 }}
        >
          <motion.div className="shape-jolt" animate={jolt}>
            <motion.div className={`shape-fx${p.mode === 'calm' ? ' is-calm' : ''}`} initial={FX.ambient} animate={fx}>
              <svg className="shape-svg" viewBox="0 0 800 800" width={800} height={800} overflow="visible">
                <defs>
                  {(Object.keys(gradientStops) as MassSpec['tone'][]).map((t) => (
                    <radialGradient key={t} id={`g-${t}`}>
                      {gradientStops[t].map(([c, o], i) => (
                        <stop key={i} offset={`${[0, 55, 100][i]}%`} stopColor={c} stopOpacity={o} />
                      ))}
                    </radialGradient>
                  ))}
                  <radialGradient id="g-glow">
                    <stop offset="0%" stopColor="#fff6c9" stopOpacity="0.95" />
                    <stop offset="45%" stopColor="#ffd25e" stopOpacity="0.42" />
                    <stop offset="100%" stopColor="#ffb03b" stopOpacity="0" />
                  </radialGradient>
                </defs>

                {/* Основная форма */}
                <motion.g animate={{ opacity: mainOpacity }} transition={{ duration: 0.5 }}>
                  <motion.g
                    style={{ transformBox: 'view-box', transformOrigin: '400px 400px' }}
                    animate={{ x: t.mass.x, y: t.mass.y, scale: t.mass.s, rotate: t.mass.r, opacity: t.mass.o }}
                    transition={move}
                  >
                  <g id="shape-masses">
                    <AnimatePresence>
                      {spec.masses.map((m, i) => {
                        const on = active(m.bind);
                        const n = hit(m.bind);
                        return (
                          <motion.g
                            key={`${p.scenario?.id ?? 'a'}-${m.id}${n && on ? `-${n}` : ''}`}
                            style={{ transformBox: 'fill-box', transformOrigin: 'center', mixBlendMode: 'screen' }}
                            initial={n ? { scale: 0.8, opacity: 0.6 } : { scale: 0, opacity: 0 }}
                            animate={{ scale: on ? 1 : 0, opacity: on ? 1 : 0 }}
                            exit={{ scale: 0.7, opacity: 0, transition: { duration: 0.3 } }}
                            transition={{ ...spring, delay: assembling && !reduced ? 0.12 + i * 0.11 : 0 }}
                          >
                            <g className="breath" style={{ ['--d' as string]: `${15 + i * 4}s`, ['--r' as string]: `${i % 2 ? -5 : 5}deg` }}>
                              <ellipse cx={m.x} cy={m.y} rx={m.rx} ry={m.ry} transform={`rotate(${m.rot} ${m.x} ${m.y})`} fill={`url(#g-${m.tone})`} />
                            </g>
                          </motion.g>
                        );
                      })}
                    </AnimatePresence>

                    {spec.glow && (
                      <motion.g
                        key={`glow-${hit(spec.glow.bind)}`}
                        style={{ transformBox: 'fill-box', transformOrigin: 'center', mixBlendMode: 'screen' }}
                        initial={{ scale: hit(spec.glow.bind) ? 0.7 : 0, opacity: 0 }}
                        animate={{ scale: active(spec.glow.bind) ? 1 : 0, opacity: active(spec.glow.bind) ? 1 : 0 }}
                        transition={{ ...spring, delay: assembling && !reduced ? 0.55 : 0 }}
                      >
                        <g className="breath" style={{ ['--d' as string]: '9s', ['--r' as string]: '0deg' }}>
                          <circle cx={spec.glow.x} cy={spec.glow.y} r={spec.glow.r} fill="url(#g-glow)" />
                        </g>
                      </motion.g>
                    )}

                    {spec.nodes && (
                      <g>
                        {spec.nodes.map((n, i) => {
                          const on = active(n.bind);
                          const inner = spec.masses[spec.masses.length - 1];
                          return (
                            <motion.g
                              key={`${n.bind}-${hit(n.bind)}`}
                              style={{ transformBox: 'fill-box', transformOrigin: 'center' }}
                              initial={{ scale: 0, opacity: 0 }}
                              animate={{ scale: 1, opacity: 1 }}
                              transition={{ ...spring, delay: assembling && !reduced ? 0.7 + i * 0.07 : 0 }}
                            >
                              <line x1={inner.x} y1={inner.y} x2={n.x} y2={n.y} stroke="#fff" strokeOpacity={on ? 0.2 : 0.07} strokeWidth="1.2" />
                              <circle cx={n.x} cy={n.y} r={n.r * 1.9} fill="#d9d8ff" fillOpacity={on ? 0.14 : 0} />
                              <circle cx={n.x} cy={n.y} r={n.r} fill={on ? '#d9d8ff' : 'none'} fillOpacity={0.92} stroke="#d9d8ff" strokeOpacity={on ? 0 : 0.35} strokeWidth="1.6" strokeDasharray={on ? undefined : '3 4'} />
                            </motion.g>
                          );
                        })}
                      </g>
                    )}

                    {spec.ring && (
                      <motion.g
                        key={`ring-${hit(spec.ring.bind)}`}
                        style={{ transformBox: 'fill-box', transformOrigin: 'center' }}
                        initial={{ scale: hit(spec.ring.bind) ? 1.25 : 0, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        transition={{ ...spring, delay: assembling && !reduced ? 0.8 : 0 }}
                      >
                        {(() => {
                          const on = active(spec.ring.bind);
                          const r = spec.ring.r;
                          return (
                            <g opacity={on ? 1 : 0.42}>
                              <circle cx={spec.ring.x} cy={spec.ring.y} r={r * 1.7} fill="#ffd25e" fillOpacity={on ? 0.1 : 0} />
                              <circle cx={spec.ring.x} cy={spec.ring.y} r={r} fill="none" stroke="#ffd25e" strokeWidth="3.2" strokeDasharray={on ? undefined : '7 11'} strokeLinecap="round" />
                              <g
                                transform={`translate(${spec.ring.x - r * 0.46} ${spec.ring.y - r * 0.46}) scale(${(r * 0.92) / 24})`}
                                fill="none"
                                stroke="#ffd25e"
                                strokeWidth="2.2"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                              >
                                {on ? lockPath : (
                                  <>
                                    <rect width="18" height="11" x="3" y="11" rx="2" ry="2" />
                                    <path d="M7 11V7a5 5 0 0 1 9.9-1" />
                                  </>
                                )}
                              </g>
                            </g>
                          );
                        })()}
                      </motion.g>
                    )}
                  </g>
                  </motion.g>
                </motion.g>

                {/* Три траектории поиска: точный, широкий, запасной */}
                <g>
                  {SEARCH_LANES.map((l) => (
                    <motion.path
                      key={`p-${l.key}`}
                      d={l.d}
                      fill="none"
                      stroke="#d9d8ff"
                      strokeWidth="1.6"
                      strokeLinecap="round"
                      initial={{ pathLength: 0, opacity: 0 }}
                      animate={searching && !reduced ? { pathLength: [0, 1, 1, 0], opacity: [0, 0.55, 0.55, 0] } : { pathLength: 0, opacity: 0 }}
                      transition={{ duration: 1.5, times: [0, 0.32, 0.72, 1], delay: l.delay, ease: 'easeInOut' }}
                    />
                  ))}
                  {SEARCH_LANES.map((l) => (
                    <motion.g
                      key={`c-${l.key}`}
                      style={{ transformOrigin: '400px 400px', transformBox: 'view-box' }}
                      initial={{ opacity: 0 }}
                      animate={
                        searching && !reduced
                          ? { x: [0, l.x, l.x, 0], y: [0, l.y, l.y, 0], scale: [1, l.s, l.s, 1], opacity: [0, 0.95, 0.95, 0] }
                          : { x: 0, y: 0, scale: 1, opacity: 0 }
                      }
                      transition={{ duration: 1.5, times: [0, 0.32, 0.72, 1], delay: l.delay, ease: 'easeInOut' }}
                    >
                      <use href="#shape-masses" />
                    </motion.g>
                  ))}
                </g>

                {/* Два маршрута: рекомендации РФ и научные публикации */}
                <g>
                  {[-1, 1].map((sgn) => (
                    <g key={sgn}>
                      <motion.path
                        d={`M400 330 C 400 430, ${400 + sgn * laneDx * 0.37} 480, ${400 + sgn * laneDx} 548`}
                        fill="none"
                        stroke={sgn < 0 ? '#ffb48a' : '#d9d8ff'}
                        strokeOpacity={0.6}
                        strokeWidth="1.8"
                        strokeLinecap="round"
                        initial={{ pathLength: 0 }}
                        animate={{ pathLength: p.route ? 1 : 0, opacity: p.route ? 1 : 0 }}
                        transition={{ duration: 0.9, delay: p.route ? 0.25 : 0 }}
                      />
                      <motion.g
                        style={{ transformOrigin: '400px 400px', transformBox: 'view-box' }}
                        initial={{ opacity: 0, x: 0, y: 0, scale: 1 }}
                        animate={p.route ? { opacity: 1, x: sgn * laneDx, y: 40, scale: laneScale } : { opacity: 0, x: 0, y: 0, scale: 1 }}
                        transition={{ ...spring, delay: p.route ? 0.1 : 0 }}
                      >
                        <use href="#shape-masses" />
                        {sgn < 0 && <ellipse cx={400} cy={410} rx={150} ry={120} fill="url(#g-warm)" opacity={0.85} style={{ mixBlendMode: 'screen' }} />}
                      </motion.g>
                    </g>
                  ))}
                </g>

                {/* Уточнение: одна форма разделяется на возможные значения */}
                <g>
                  {t.clones.map((cl, i) => (
                    <motion.g
                      key={`cl-${i}`}
                      style={{ transformOrigin: '400px 400px', transformBox: 'view-box' }}
                      initial={{ opacity: 0, x: 0, y: 0, scale: 1 }}
                      animate={{
                        opacity: cl.o ? (p.hot < 0 || p.hot === i ? 1 : 0.5) : 0,
                        x: cl.x,
                        y: cl.y,
                        scale: cl.o ? cl.s * (p.hot === i ? 1.14 : 1) : 1,
                      }}
                      transition={{ ...move, delay: reduced ? 0 : i * 0.08 }}
                    >
                      <use href="#shape-masses" />
                    </motion.g>
                  ))}
                </g>

                {/* Орбита ограничений */}
                <motion.g
                  className="orbit"
                  animate={{ opacity: p.route ? 0 : t.orbitO }}
                >
                  <ellipse cx="400" cy="400" rx="288" ry="259" fill="none" stroke="#fff" strokeOpacity="0.07" />
                  <AnimatePresence>
                    {orbit.map((d, i) => {
                      const n = hit(d.key);
                      return (
                        <motion.g
                          key={`${d.key}${n ? `-${n}` : ''}`}
                          style={{ transformBox: 'fill-box', transformOrigin: 'center' }}
                          initial={{ scale: n ? 2 : 0, opacity: 0 }}
                          animate={{ scale: 1, opacity: 1 }}
                          exit={{ scale: 0, opacity: 0, transition: { duration: 0.25 } }}
                          transition={{ ...spring, delay: assembling && !reduced ? 0.9 + i * 0.06 : 0 }}
                        >
                          <motion.circle
                            initial={{ cx: 400, cy: 400 }}
                            animate={{ cx: d.x, cy: d.y }}
                            transition={spring}
                            r={d.size}
                            fill={d.kind === 'period' ? 'none' : d.kind === 'fulltext' ? '#ffd25e' : '#d9d8ff'}
                            stroke={d.kind === 'period' ? '#ffd25e' : 'none'}
                            strokeWidth={d.kind === 'period' ? 2.6 : 0}
                            fillOpacity={0.95}
                          />
                        </motion.g>
                      );
                    })}
                  </AnimatePresence>
                </motion.g>
              </svg>
            </motion.div>

            {/* Объекты доказательств: двигаются между композициями пружиной */}
            <motion.div className="shape-field" initial={{ opacity: 0 }} animate={field}>
              <svg viewBox="0 0 800 800" width={800} height={800} overflow="visible">
                {t.discs.map((d, i) => (
                  <motion.circle
                    key={`d${i}`}
                    fill={`url(#g-${d.tone})`}
                    style={{ mixBlendMode: 'screen' }}
                    initial={{ cx: d.x, cy: d.y, r: 0, opacity: 0 }}
                    animate={{ cx: d.x, cy: d.y, r: d.r, opacity: d.o }}
                    transition={{ ...move, r: size, delay: reduced ? 0 : i * 0.04 }}
                  />
                ))}
                {t.links.map((l, i) => (
                  <motion.line
                    key={`l${i}`}
                    stroke="#fff"
                    strokeWidth="1.4"
                    initial={{ x1: l.x1, y1: l.y1, x2: l.x2, y2: l.y2, opacity: 0 }}
                    animate={{ x1: l.x1, y1: l.y1, x2: l.x2, y2: l.y2, opacity: l.o }}
                    transition={move}
                  />
                ))}
                {t.dots.map((d, i) => (
                  <motion.rect
                    key={`o${i}`}
                    fill={d.c}
                    initial={{ x: d.x, y: d.y, width: 0, height: 0, rx: 0, opacity: 0 }}
                    animate={{ x: d.x - d.w / 2, y: d.y - d.h / 2, width: d.w, height: d.h, rx: d.r ?? Math.min(d.w, d.h) / 2, opacity: d.o }}
                    transition={{ ...move, width: size, height: size, rx: size, delay: reduced ? 0 : i * 0.012 }}
                  />
                ))}
              </svg>
            </motion.div>
          </motion.div>
        </motion.div>

        {/* Семена: слова запроса стягиваются в форму */}
        {seeds.map((s) => (
          <motion.span
            key={`${p.seedRun}-${s.i}`}
            className={`seed seed--${s.kind}`}
            initial={{ x: s.x - 5, y: s.y - 5, opacity: 0, scale: 1.4 }}
            animate={{ x: s.to.x - 5, y: s.to.y - 5, opacity: [0, 1, 1, 0], scale: [1.4, 1, 0.9, 0.3] }}
            transition={{ duration: 0.85, delay: s.i * 0.06, times: [0, 0.18, 0.78, 1], ease: [0.5, 0, 0.2, 1] }}
          />
        ))}

        {/* Названия двух маршрутов */}
        <AnimatePresence>
          {labels.map((l, i) => (
            <motion.span
              key={l.key}
              className="lane-label"
              style={{ left: l.x, top: l.y, x: '-50%' }}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ delay: 0.5 + i * 0.1, duration: 0.5 }}
            >
              {l.label}
            </motion.span>
          ))}
        </AnimatePresence>
      </motion.div>
    </div>
  );
}
