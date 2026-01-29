# Hiworks Commute

macOS 상태바에서 Hiworks 출퇴근을 간편하게 관리하는 앱입니다.

## 기능

- **출근/퇴근** - 클릭 한 번으로 출퇴근 기록
- **상태 변경** - 업무, 외출, 회의, 외근 상태 전환
- **자동 로그인** - 아이디/비밀번호 저장 후 자동 로그인
- **시스템 트레이** - 상태바에서 바로 접근

## 기술 스택

- **Tauri 2.0** - 네이티브 macOS 앱
- **Playwright** - 웹 자동화

## 설치 및 실행

### 요구 사항

- macOS
- Node.js 18+
- Rust

### 개발 환경 실행

```bash
# 의존성 설치
npm install

# 개발 모드 실행
npm run dev
```

### 빌드

```bash
npm run build
```

빌드된 앱은 `src-tauri/target/release/bundle/` 에 생성됩니다.

## 사용 방법

1. 앱 실행 후 상태바의 아이콘 클릭
2. 설정에서 회사 URL, 아이디, 비밀번호 입력
3. 출근/퇴근 버튼으로 기록
