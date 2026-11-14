# Health Monitoring Software — NASA Space Apps 2026

Prueba visual para descartar ideas de interfaz. No es un dispositivo médico: la telemetría es ficticia y vive en el navegador.

La referencia es el menú de la saga Metro: un objeto que se toca, no un panel flotante. El mismo cuerpo se mira de tres maneras.

- **Diario.** Cuaderno abierto bajo una lámpara. Cada línea es un sistema del cuerpo, escrito a mano, con un sello de estado.
- **Reloj.** El dosímetro de muñeca, como el reloj del túnel. La aguja grande es la radiación; los subdiales son pulso, oxígeno y presión del traje.
- **Casco.** El cristal del yelmo, empañado por la respiración. Los números van grabados en el borde, no en una ventana.

## Cómo verla

Hace falta un servidor estático. Los módulos no abren desde `file://`.

```bash
python3 -m http.server 8765
```

Después, [http://127.0.0.1:8765](http://127.0.0.1:8765).

## Controles

| Acción | Cómo |
| --- | --- |
| Cambiar de mirada | diario, reloj o casco, o las teclas D, R y C |
| Abrir un capítulo | clic en el diario, o teclas 1 a 6 |
| Volver | «volver» en la hoja, o Escape |
| Cambiar el incidente | norma, oxígeno, llamarada, fuga, desvelo, o la tecla I |
| Sonido de la lámpara | el botón lámpara, la lámpara de la mesa, o M |

La perilla y los objetos de la mesa también se pueden tocar.

Atajos de revisión: `?mirada=casco`, `?capitulo=2` (capítulo II, del 1 al 6), `?incidente=llamarada`. Si la mirada, el capítulo o el incidente no existen, se ignoran. `?post=1` fuerza el bloom aunque el equipo no tenga GPU.

```bash
node --test
```

## Qué hay debajo

WebGL con Three.js r170, vendido en `vendor/` (licencia MIT). Las fuentes Caveat, Russo One y Share Tech Mono están en `fonts/` bajo la SIL Open Font License.
