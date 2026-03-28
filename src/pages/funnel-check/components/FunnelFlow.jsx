import { DIMENSIONS } from '../constants';

export const FunnelFlow = ({ mode = 'quiz', activeDimensionKey, bottleneckKey, scores }) => {
  void mode;
  void activeDimensionKey;
  void bottleneckKey;
  void scores;
  void DIMENSIONS;

  return (
    <section aria-label="漏斗視覺化" className="w-full">
      <div className="w-full overflow-hidden rounded-2xl bg-white border border-slate-200 p-2">
        <div className="relative w-full">
          <img
            src="/funnel-check.png"
            alt="事業行銷漏斗圖"
            className="w-full h-auto select-none"
            loading="eager"
          />
        </div>
      </div>
    </section>
  );
};

