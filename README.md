# InfoBoard Dashboard

Next.js 기반 위젯형 대시보드입니다.

- 타겟 화면: 27인치 모니터 세로 배치(참고 비율 1440x2560)
- 위젯: 시계, 날씨, 달력
- 위젯 이동: 드래그 앤 드롭 정렬
- 스타일: 블러 처리된 배경 이미지 + 유리 질감 카드

## Getting Started

```bash
npm install
```

```bash
npm run dev
```

브라우저에서 `http://localhost:3000` 접속.

## Commands

```bash
npm run lint
npm run build
npm run start
```

## Environment Variables

Create `.env.local` if you want ICS calendar events:

```bash
CALENDAR_ICS_URLS=https://example.com/calendar1.ics,https://example.com/calendar2.ics
```

## Project Files

- 기본 설계 문서: `docs/PROGRAM_SPEC.md`
- 메인 페이지: `src/app/page.tsx`
- 대시보드/드래그 로직: `src/components/dashboard.tsx`
- 위젯 컴포넌트: `src/components/widgets/*`
- 날씨 API 라우트: `src/app/api/weather/route.ts`
- 뉴스 API 라우트: `src/app/api/news/route.ts`
- ICS 일정 API 라우트: `src/app/api/calendar-events/route.ts`

## Deploy to Vercel

1. GitHub에 저장소 push
2. Vercel에서 `Add New Project` 선택
3. 해당 저장소 import
4. Framework Preset은 Next.js 자동 인식
5. Deploy 실행

또는 CLI:

```bash
npm i -g vercel
vercel
```
