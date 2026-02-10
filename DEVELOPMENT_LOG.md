# Development Log

프로젝트의 개발 과정을 Git 커밋과 함께 추적하기 위한 기록 파일입니다.

## Workflow

1. 작업 시작 전:
   - `git checkout -b feat/<기능명>` 또는 `fix/<수정명>`
2. 기능 단위 구현 후:
   - `git add .`
   - `git commit -m "feat: <변경 요약>"`
3. 배포 전:
   - 로컬 확인 후 `main`에 병합
   - `vercel --prod`로 배포

## Commit Convention

- `feat:` 사용자 기능 추가
- `fix:` 버그 수정
- `style:` UI/CSS 변경
- `refactor:` 동작 변경 없는 구조 개선
- `docs:` 문서 수정
- `chore:` 설정/도구 변경

## Log Entries

### 2026-02-10

- `chore: initialize project with joy playground web app`
- 정적 웹앱 파일(`index.html`, `styles.css`, `app.js`) 구성
- 인터랙션(클릭/드래그), 사운드(Web Audio), 진동(`navigator.vibrate`) 구현
- `chore: add vercel deployment config`
- `chore: connect repository and deploy to vercel production`
- 원격 저장소 `https://github.com/hhkong2/project_0.git` 연결 및 `main` 푸시
- Vercel 프로젝트 `heekwangs-projects/minesweeper` 생성 및 프로덕션 배포 완료
