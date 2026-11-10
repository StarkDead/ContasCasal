# Casa em Dia

App de computador (Electron) para o casal controlar as contas da casa: saldo previsto, contas a pagar, contas divididas, cartões, reserva e planejamento de amortização de financiamentos. Importa extrato (OFX/CSV), fatura de cartão e planilha de contas.

Os dados ficam em um arquivo `.json` escolhido na primeira abertura. Para usar em dois computadores, guarde esse arquivo numa pasta sincronizada (Google Drive, OneDrive).

## Rodar

```bash
npm install
```

```bash
npm start
```

## Gerar a versão para Windows

```bash
npm run dist
```

O resultado sai em `dist/`.
