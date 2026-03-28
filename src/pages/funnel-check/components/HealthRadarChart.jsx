import { ResponsiveContainer, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Radar } from 'recharts';
import { DIMENSIONS } from '../constants';

const axisLabelByKey = Object.fromEntries(DIMENSIONS.map((d) => [d.key, d.label]));

export const HealthRadarChart = ({ scores }) => {
  const safeScores = scores || {};
  const data = DIMENSIONS.map((d) => ({
    axis: axisLabelByKey[d.key] || d.key,
    value: safeScores?.[d.key] ?? 0,
  }));

  return (
    <section className="bg-white rounded-2xl shadow-lg border border-slate-200 p-4">
      <h2 className="font-bold text-slate-900 mb-3">能力雷達圖</h2>
      <div className="w-full h-64">
        <ResponsiveContainer>
          <RadarChart cx="50%" cy="50%" outerRadius="90%" data={data}>
            <PolarGrid />
            <PolarAngleAxis dataKey="axis" tick={{ fill: '#475569', fontSize: 11 }} />
            <PolarRadiusAxis angle={30} domain={[0, 10]} tick={{ fill: '#64748B', fontSize: 10 }} />
            <Radar
              dataKey="value"
              stroke="#10B981"
              fill="#34D399"
              fillOpacity={0.35}
              strokeWidth={2}
            />
          </RadarChart>
        </ResponsiveContainer>
      </div>
      <p className="text-xs text-slate-500 mt-3">雷達圖分數範圍：0 - 10。每一軸都是實際題目累加（每面向 2 題）。</p>
    </section>
  );
};

