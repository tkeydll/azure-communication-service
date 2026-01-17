# Azure Communication Service - Phone Calling App

Azure Communication Service を使用して電話をかけるアプリケーションです。Node.js/TypeScript で実装されており、Azure リソースのデプロイに Bicep テンプレートを使用します。

## 🚀 機能

- Azure Communication Service を使用した電話発信
- TypeScript による型安全な実装
- 環境変数による設定管理
- Azure リソースの IaC（Infrastructure as Code）による管理

## 📋 前提条件

- Node.js 18.0.0 以上
- Azure サブスクリプション
- Azure CLI（リソースデプロイ用）

## 🔧 セットアップ

### 1. 依存関係のインストール

```bash
npm install
```

### 2. Azure リソースのデプロイ

詳細な手順は [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) を参照してください。

```bash
# リソースグループの作成
az group create --name rg-communication-service --location japaneast

# Bicep テンプレートのデプロイ
az deployment group create \
  --resource-group rg-communication-service \
  --template-file infra/main.bicep \
  --parameters infra/main.bicepparam
```

### 3. 環境変数の設定

`.env` ファイルを作成し、以下の情報を設定：

```env
COMMUNICATION_SERVICES_CONNECTION_STRING=<your-connection-string>
FROM_PHONE_NUMBER=<your-purchased-phone-number>
TO_PHONE_NUMBER=<destination-phone-number>
```

`.env.example` をテンプレートとして使用できます。

### 4. 電話番号の購入

Azure Portal で Communication Service の電話番号を購入する必要があります。詳細は [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) を参照してください。

## 🎯 使い方

### ビルド

```bash
npm run build
```

### 実行

```bash
# 開発モード（ts-node を使用）
npm run dev

# プロダクションモード
npm start
```

### その他のコマンド

```bash
# TypeScript の監視モード
npm run watch

# リント
npm run lint

# リント自動修正
npm run lint:fix

# テスト
npm test
```

## 📁 プロジェクト構造

```
azure-communication-service/
├── src/                    # アプリケーションソースコード
│   ├── index.ts           # エントリーポイント
│   ├── callService.ts     # 通話サービスのロジック
│   └── config.ts          # 設定管理
├── infra/                 # Azure リソーステンプレート
│   ├── main.bicep         # Bicep テンプレート
│   └── main.bicepparam    # パラメータファイル
├── docs/                  # ドキュメント
│   └── DEPLOYMENT.md      # デプロイ手順
├── config/                # 設定ファイル
├── tests/                 # テストコード
├── .env.example           # 環境変数のテンプレート
├── package.json           # プロジェクト設定
└── tsconfig.json          # TypeScript 設定
```

## 🔒 セキュリティ

- `.env` ファイルは Git にコミットしないでください（`.gitignore` に含まれています）
- 接続文字列や電話番号などの機密情報は環境変数で管理してください
- Azure リソースへのアクセス権限を適切に設定してください

## 💰 料金について

- Azure Communication Service は従量課金制です
- 電話番号のレンタル料金が発生します
- 通話料金は使用量に応じて課金されます

詳細は [Azure Communication Services の価格](https://azure.microsoft.com/pricing/details/communication-services/) を参照してください。

## 📚 参考リンク

- [Azure Communication Services ドキュメント](https://learn.microsoft.com/azure/communication-services/)
- [Calling SDK の機能](https://learn.microsoft.com/azure/communication-services/concepts/voice-video-calling/calling-sdk-features)
- [クイックスタート: 電話をかける](https://learn.microsoft.com/azure/communication-services/quickstarts/voice-video-calling/pstn-call)

## 📝 ライセンス

MIT License

## 🤝 貢献

プルリクエストを歓迎します！バグ報告や機能リクエストは Issue で受け付けています。