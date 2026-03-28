export const buildFunnelDiagnosisFlex = ({
  userName,
  bottleneckKey,
  bottleneckLabel,
  scores,
  officialAccountUrl,
  screenshotUrl,
}) => {
  void officialAccountUrl;
  // 目前先移除 image 區塊，這是 LIFF INVALID_MESSAGE 最常見來源之一。
  void screenshotUrl;

  const scoreTraffic = scores?.traffic ?? 0;
  const scoreLeadCapture = scores?.leadCapture ?? 0;
  const scoreSegmentation = scores?.segmentation ?? 0;
  const scoreTrustNurturing = scores?.trustNurturing ?? 0;
  const scoreConversion = scores?.conversion ?? 0;
  const scoreFissionAscension = scores?.fissionAscension ?? 0;

  const bottleneckText = bottleneckLabel || '（未計算）';
  const isBottleneckMode = !!bottleneckKey;

  return {
    type: 'flex',
    altText: '📊 事業行銷漏斗健檢報告',
    contents: {
      type: 'bubble',
      body: {
        type: 'box',
        layout: 'vertical',
        spacing: 'md',
        contents: [
          {
            type: 'box',
            layout: 'vertical',
            backgroundColor: '#0F172A',
            cornerRadius: 'md',
            paddingAll: 'md',
            contents: [
              {
                type: 'text',
                text: '📊 事業行銷漏斗健檢報告',
                weight: 'bold',
                size: 'lg',
                color: '#FFFFFF',
                wrap: true,
              },
              {
                type: 'text',
                text: 'Marketing Funnel Diagnosis',
                size: 'xs',
                color: '#94A3B8',
                margin: 'sm',
              },
            ],
          },
          {
            type: 'text',
            text: `Hi, ${userName} 老闆/總裁`,
            weight: 'bold',
            size: 'md',
            color: '#1E293B',
            margin: 'md',
          },
          {
            type: 'text',
            text: isBottleneckMode ? '經過系統運算，您的行銷漏斗最大破洞在於：' : '經過系統運算，你的行銷漏斗整體表現很強：',
            size: 'sm',
            color: '#64748B',
            wrap: true,
          },
          {
            type: 'box',
            layout: 'vertical',
            margin: 'lg',
            spacing: 'sm',
            contents: [
              {
                type: 'box',
                layout: 'baseline',
                spacing: 'sm',
                contents: [
                  {
                    type: 'text',
                    text: isBottleneckMode ? '⚠️ 重度卡關' : '✅ 整體表現很強',
                    color: isBottleneckMode ? '#EF4444' : '#10B981',
                    size: 'sm',
                    weight: 'bold',
                    flex: 3,
                  },
                  {
                    type: 'text',
                    text: `【${bottleneckText}】`,
                    wrap: true,
                    color: isBottleneckMode ? '#B91C1C' : '#059669',
                    size: 'lg',
                    weight: 'bold',
                    flex: 5,
                  },
                ],
              },
            ],
          },
          { type: 'separator', margin: 'md' },
          {
            type: 'text',
            text: '各維度健康度指標（滿分 10 分）',
            weight: 'bold',
            size: 'sm',
            color: '#334155',
          },
          {
            type: 'box',
            layout: 'vertical',
            spacing: 'sm',
            contents: [
              {
                type: 'box',
                layout: 'horizontal',
                contents: [
                  { type: 'text', text: '流量曝光', size: 'sm', color: '#64748B', flex: 4 },
                  { type: 'text', text: `${scoreTraffic} 分`, size: 'sm', weight: 'bold', align: 'end', color: '#0F172A', flex: 2 },
                ],
              },
              {
                type: 'box',
                layout: 'horizontal',
                contents: [
                  { type: 'text', text: '名單留存', size: 'sm', color: '#64748B', flex: 4 },
                  { type: 'text', text: `${scoreLeadCapture} 分`, size: 'sm', weight: 'bold', align: 'end', color: '#0F172A', flex: 2 },
                ],
              },
              {
                type: 'box',
                layout: 'horizontal',
                contents: [
                  { type: 'text', text: '標籤分眾', size: 'sm', color: '#64748B', flex: 4 },
                  { type: 'text', text: `${scoreSegmentation} 分`, size: 'sm', weight: 'bold', align: 'end', color: '#0F172A', flex: 2 },
                ],
              },
              {
                type: 'box',
                layout: 'horizontal',
                contents: [
                  { type: 'text', text: '信任培育', size: 'sm', color: '#64748B', flex: 4 },
                  { type: 'text', text: `${scoreTrustNurturing} 分`, size: 'sm', weight: 'bold', align: 'end', color: '#0F172A', flex: 2 },
                ],
              },
              {
                type: 'box',
                layout: 'horizontal',
                contents: [
                  { type: 'text', text: '轉換變現', size: 'sm', color: '#64748B', flex: 4 },
                  { type: 'text', text: `${scoreConversion} 分`, size: 'sm', weight: 'bold', align: 'end', color: '#0F172A', flex: 2 },
                ],
              },
              {
                type: 'box',
                layout: 'horizontal',
                contents: [
                  { type: 'text', text: '裂變與升級', size: 'sm', color: '#64748B', flex: 4 },
                  { type: 'text', text: `${scoreFissionAscension} 分`, size: 'sm', weight: 'bold', align: 'end', color: '#0F172A', flex: 2 },
                ],
              },
            ],
          },
          {
            type: 'text',
            text: '回覆「我要諮詢」即可取得 1 對 1 協助。',
            size: 'sm',
            color: '#475569',
            wrap: true,
          },
        ],
      },
    },
  };
};

