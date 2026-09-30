# 큰 로어북 항목 편집 측정

`benchmark.test.ts`는 module이 있는 charx 문서에 로어북 항목 2,000개를 넣어요. 각 content는 2 KiB이고 대략 4 MiB의 본문이에요. 실제 createServices와 가짜 Storage·FormatsApi를 사용하고 `updateItem`으로 중간 항목 하나를 바꿔요.

5회 준비 실행 뒤 30회 호출 시간을 Node performance.now로 측정해 평균을 출력해요. 입력 준비·초기화·dispose는 측정에서 제외하고 편집 명령 내부의 상태 공개와 자동 저장 예약은 포함해요. 타이머는 가짜로 관리해 저장·interval이 측정 도중 실행되지 않게 해요. 시간 한도는 assert하지 않아요.

같은 worktree의 verbose 테스트 실행에서 최적화 전 평균은 29.39ms였고, 경로 복사·동결 객체 재사용·자동 저장 복사 지연 적용 뒤 두 실행의 평균은 1.97ms와 1.43ms였어요. 실행 환경과 부하에 따라 수치가 달라져요. `npm test -- --reporter=verbose`로 다시 측정할 수 있어요.
