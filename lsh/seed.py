"""Banco de ejemplo: 4 textos originales y copias con distintos tipos de plagio."""
from __future__ import annotations

import re

BASES = {
    "Fotosíntesis": "La fotosíntesis es el proceso mediante el cual las plantas convierten la luz del sol en energía química. Ocurre principalmente en las hojas, dentro de unos orgánulos llamados cloroplastos. Allí la clorofila absorbe la luz y la usa para transformar agua y dióxido de carbono en glucosa y oxígeno. La glucosa sirve como alimento para la planta y el oxígeno se libera a la atmósfera. Sin este proceso la mayor parte de la vida en la Tierra no podría existir. Por eso las plantas son la base de casi todas las cadenas alimentarias.",
    "Ciclo del agua": "El ciclo del agua describe el movimiento continuo del agua entre los océanos, la atmósfera y la superficie terrestre. El calor del sol evapora el agua de mares, ríos y lagos, y la convierte en vapor. Al subir, el vapor se enfría y forma nubes compuestas por pequeñas gotas. Cuando las gotas crecen lo suficiente caen como lluvia, nieve o granizo. Parte del agua se infiltra en el suelo y parte corre hacia los ríos, que la llevan de vuelta al mar. Así el ciclo vuelve a empezar sin detenerse nunca.",
    "Cómo funciona internet": "Internet es una red mundial de computadoras que se comunican mediante protocolos comunes. Cuando abres una página, tu equipo envía una solicitud que viaja dividida en pequeños paquetes. Los routers reciben cada paquete y lo reenvían por el mejor camino disponible hasta el servidor. El servidor responde con otros paquetes que se reensamblan en tu pantalla. Todo esto ocurre en fracciones de segundo gracias a cables submarinos y antenas. Por eso podemos hablar con alguien al otro lado del planeta casi al instante.",
    "Física de la bicicleta": "Una bicicleta se mantiene en pie mientras avanza gracias a la combinación de varios efectos físicos. Las ruedas giratorias generan un efecto giroscópico que ayuda a conservar la dirección del movimiento. Además, la geometría de la horquilla delantera hace que la rueda se alinee sola con la trayectoria. Cuando el ciclista se inclina, gira el manubrio hacia ese lado y recupera el equilibrio. A mayor velocidad la estabilidad aumenta y resulta más fácil mantener el rumbo. Por esa razón es más difícil equilibrarse cuando se va muy despacio.",
}
SYN = {"proceso": "mecanismo", "principalmente": "sobre todo", "energía": "fuerza", "mundial": "global",
       "continuo": "constante", "pequeños": "diminutos", "casi": "prácticamente", "ayuda": "contribuye",
       "describe": "explica", "llamados": "denominados", "mayor": "más grande", "rumbo": "dirección"}


def _sentences(t: str) -> list[str]:
    return [s.strip() for s in re.split(r"(?<=[.])\s+", t) if s.strip()]


def _swap(t: str) -> str:
    for a, b in SYN.items():
        t = re.sub(rf"\b{a}\b", b, t)
    return t


def build_samples() -> list[dict]:
    names, out = list(BASES), []
    for i, (name, text) in enumerate(BASES.items()):
        s = _sentences(text)
        other = _sentences(BASES[names[(i + 1) % len(names)]])
        out += [
            {"title": f"{name} (original)", "content": text},
            {"title": f"{name} (oraciones reordenadas)", "content": " ".join(reversed(s))},
            {"title": f"{name} (palabras cambiadas)", "content": _swap(text)},
            {"title": f"{name} (mitad copiada)", "content": " ".join(s[:3] + other[3:])},
        ]
    return out
