export const CHAPTERS = [
  {
    id: "pulso",
    num: "I",
    title: "sangre y pulso",
    ru: "ПУЛЬС",
    unit: "ud/min",
    sketch: "heart",
    lines: [
      "Late a {v} por minuto.",
      "A veces se adelanta,",
      "como el generador viejo.",
      "Si en reposo pasa de cien,",
      "no hay EVA. Se anota",
      "la hora y se espera.",
    ],
  },
  {
    id: "oxigeno",
    num: "II",
    title: "oxígeno",
    ru: "КИСЛОРОД",
    unit: "% tanque",
    sketch: "lungs",
    lines: [
      "Queda {v} en el tanque.",
      "El scrubber de CO2",
      "suena más grave que ayer.",
      "Si baja de un cuarto,",
      "se vuelve adentro.",
      "El papel no negocia.",
    ],
  },
  {
    id: "radiacion",
    num: "III",
    title: "radiación",
    ru: "РАДИАЦИЯ",
    unit: "mSv/h",
    sketch: "trefoil",
    lines: [
      "El dosímetro marca {v}.",
      "Dentro del módulo, ronronea.",
      "Afuera, muerde.",
      "Cuando la aguja salta,",
      "se cierra la tapa",
      "y no se mira el sol.",
    ],
  },
  {
    id: "traje",
    num: "IV",
    title: "el traje",
    ru: "СКАФАНДР",
    unit: "psi",
    sketch: "suit",
    lines: [
      "Presión {v}.",
      "El sello del casco",
      "suda de noche.",
      "Si la columna verde cae,",
      "no es el medidor.",
      "Es el aire que se va.",
    ],
  },
  {
    id: "sueno",
    num: "V",
    title: "el sueño",
    ru: "СОН",
    unit: "horas",
    sketch: "sleep",
    lines: [
      "Llevo {v} horas, a tirones.",
      "El sol sale cada",
      "noventa minutos",
      "y el cuerpo ya no le cree.",
      "Sin sueño, el pulso",
      "miente más que el tanque.",
    ],
  },
  {
    id: "agua",
    num: "VI",
    title: "el agua",
    ru: "ВОДА",
    unit: "%",
    sketch: "water",
    lines: [
      "Hidratación {v}.",
      "La cantimplora pesa menos.",
      "El agua sabe al metal",
      "del módulo.",
      "Igual se bebe.",
      "La sed no avisa a tiempo.",
    ],
  },
];

export const SCENARIOS = [
  {
    id: "norma",
    ru: "НОРМА",
    es: "norma",
    note: "La lámpara sigue viva. Nada que tachar.",
    whisper: "Día quieto. Las agujas descansan.",
  },
  {
    id: "oxigeno",
    ru: "КИСЛОРОД",
    es: "oxígeno",
    note: "El tanque baja torcido. No fiarse del silencio.",
    whisper: "El oxígeno se está yendo. Mirá el tanque.",
  },
  {
    id: "llamarada",
    ru: "ВСПЫШКА",
    es: "llamarada",
    note: "No abrir la escotilla. El dosímetro muerde.",
    whisper: "Llamarada. El dosímetro se volvió loco.",
  },
  {
    id: "fuga",
    ru: "ТЕЧЬ",
    es: "fuga",
    note: "El sello del casco suda. Revisar antes de dormir.",
    whisper: "Fuga en el traje. La columna verde cae.",
  },
];

export const MODES = [
  {
    id: "diario",
    label: "diario",
    whisper: "El diario. Se lee despacio, con la lámpara.",
  },
  {
    id: "reloj",
    label: "reloj",
    whisper: "El reloj. Para no soltar el trabajo.",
  },
  {
    id: "casco",
    label: "casco",
    whisper: "El cristal del casco. Para cuando afuera no hay pared.",
  },
];

export const STATUS_LABEL = {
  ok: "estable",
  watch: "vigilar",
  bad: "no salir",
};

export const STATUS_RU = {
  ok: "ГОДЕН",
  watch: "ВНИМАНИЕ",
  bad: "НЕ ГОДЕН",
};

export const PAGE_W = 1024;
export const PAGE_H = 1408;

export const INDEX_BASELINES = [460, 580, 700, 820, 940, 1060];
