import { useCallback, useMemo, useState } from "react";

import Plot from "react-plotly.js";

import type { PorkchopData } from "../types";



interface PorkchopPlotProps {
  porkchop: PorkchopData | null;
  referenceDeparture?: string | null;
}



export default function PorkchopPlot({ porkchop, referenceDeparture }: PorkchopPlotProps) {

  const [hoverInfo, setHoverInfo] = useState<string | null>(null);



  const { zData, xLabels, yLabels } = useMemo(() => {

    if (!porkchop) return { zData: null, xLabels: [] as string[], yLabels: [] as string[] };



    const nDep = porkchop.departure_epochs.length;

    const nTof = porkchop.tof_days.length;

    const z: (number | null)[][] = [];

    for (let t = 0; t < nTof; t++) {

      const row: (number | null)[] = [];

      for (let d = 0; d < nDep; d++) {

        const v = porkchop.delta_v[d]?.[t];

        row.push(v !== null && v !== undefined ? v / 1000 : null);

      }

      z.push(row);

    }



    return {

      zData: z,

      xLabels: porkchop.departure_epochs.map((d) => new Date(d).toLocaleDateString()),

      yLabels: porkchop.tof_days.map((d) => d.toFixed(0)),

    };

  }, [porkchop]);



  const handleHover = useCallback(

    (event: Readonly<Plotly.PlotHoverEvent>) => {

      if (!porkchop || !event.points[0]) return;

      const pt = event.points[0];

      const tofIdx = pt.y as number;

      const depIdx = pt.x as number;

      if (depIdx >= porkchop.departure_epochs.length || tofIdx >= porkchop.tof_days.length) return;



      const departure = porkchop.departure_epochs[depIdx];

      const tof = porkchop.tof_days[tofIdx];

      const dv = porkchop.delta_v[depIdx]?.[tofIdx];



      setHoverInfo(

        `Δv: ${dv != null ? (dv / 1000).toFixed(2) : "N/A"} km/s, TOF: ${tof.toFixed(0)} d, depart: ${new Date(departure).toLocaleDateString()}`,

      );

    },

    [porkchop],

  );



  const refXIndex = useMemo(() => {
    if (!porkchop || !referenceDeparture) return null;
    const refMs = new Date(referenceDeparture).getTime();
    let bestIdx = 0;
    let bestDelta = Infinity;
    porkchop.departure_epochs.forEach((d, i) => {
      const delta = Math.abs(new Date(d).getTime() - refMs);
      if (delta < bestDelta) {
        bestDelta = delta;
        bestIdx = i;
      }
    });
    return bestIdx;
  }, [porkchop, referenceDeparture]);

  if (!porkchop || !zData) {

    return (

      <div className="porkchop-placeholder" data-tour="porkchop">

        <p>Porkchop plot will appear after calculation</p>

      </div>

    );

  }



  return (

    <div className="porkchop-plot" data-tour="porkchop">

      <h3>Porkchop Plot (Δv km/s)</h3>

      {hoverInfo && <p className="hover-info">{hoverInfo}</p>}

      <Plot

        data={[

          {

            z: zData,

            x: xLabels,

            y: yLabels,

            type: "heatmap",

            colorscale: [
              [0, "#0a0a0a"],
              [0.25, "#2a2a2a"],
              [0.5, "#555555"],
              [0.75, "#888888"],
              [1, "#cccccc"],
            ],

            hoverongaps: false,

          },

        ]}

        layout={{
          autosize: true,
          height: 280,
          margin: { l: 50, r: 10, t: 10, b: 70 },
          xaxis: {
            title: { text: "Departure date", font: { size: 10, color: "rgba(255,255,255,0.55)" } },
            tickangle: -45,
            gridcolor: "rgba(255,255,255,0.06)",
            linecolor: "rgba(255,255,255,0.08)",
            tickfont: { color: "rgba(255,255,255,0.45)", size: 9 },
          },
          yaxis: {
            title: { text: "TOF (days)", font: { size: 10, color: "rgba(255,255,255,0.55)" } },
            gridcolor: "rgba(255,255,255,0.06)",
            linecolor: "rgba(255,255,255,0.08)",
            tickfont: { color: "rgba(255,255,255,0.45)", size: 9 },
          },
          paper_bgcolor: "transparent",
          plot_bgcolor: "#0a0a0a",
          font: { color: "rgba(255,255,255,0.7)", family: "Inter, sans-serif", size: 10 },
          shapes:
            refXIndex != null
              ? [
                  {
                    type: "line",
                    x0: refXIndex,
                    x1: refXIndex,
                    y0: 0,
                    y1: porkchop.tof_days.length - 1,
                    xref: "x",
                    yref: "y",
                    line: { color: "rgba(255,255,255,0.6)", width: 1.5, dash: "dash" },
                  },
                ]
              : [],
        }}

        config={{ displayModeBar: false, responsive: true }}

        useResizeHandler

        style={{ width: "100%", maxWidth: "100%" }}

        onHover={handleHover}

      />

    </div>

  );

}


