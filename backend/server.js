const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
require('dotenv').config();
const { Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType, BorderStyle, Tab, TabStopPosition, TabStopType } = require('docx');

const app = express();
const PORT = process.env.PORT || 3001;
const JWT_SECRET = process.env.JWT_SECRET || (() => { console.error('⚠️ SEGURANÇA: JWT_SECRET não configurado, usando fallback temporário — CONFIGURAR EM PRODUÇÃO'); return 'capi-candia-secret-2026'; })();
const OPENAI_API_KEY = process.env.OPENAI_API_KEY || '';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || (() => { console.error('⚠️ SEGURANÇA: ADMIN_PASSWORD não configurado, usando fallback temporário — CONFIGURAR EM PRODUÇÃO'); return 'capiAdmin2026'; })();
const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY || (() => { console.error('⚠️ SEGURANÇA: ELEVENLABS_API_KEY não configurado, usando fallback temporário'); return 'sk_ef7c32daa249f0825ec017f69aa8721b2ca641739c552e8d'; })();
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || (() => { console.error('⚠️ SEGURANÇA: GEMINI_API_KEY não configurado, usando fallback temporário'); return 'AIzaSyB0dw7uiZYobpmH4euewn4M4u0Nfp5EQk0'; })();
const CAPI_FINETUNED_MODEL = process.env.CAPI_FINETUNED_MODEL || 'ft:gpt-4.1-mini-2025-04-14:personal:capi-juridico:DTj8Jwm2';
const ELEVENLABS_VOICE_ID = process.env.ELEVENLABS_VOICE_ID || '60fiathVaK4HCn08Syd6';

// ─── HONORÁRIOS OAB — 27 SECCIONAIS ─────────────────────────────
const HONORARIOS = {
  "AC": {
    nome: "Acre",
    ano: "2024 (Resolução nº 07/2024)",
    civel: "Até 20 SM: Demais ações petitórias: R$ 4.180 (20% proveito econ.); 20-100 SM: Antecedentes c/ pedido principal: R$ 1.430 (10%); Acima 100 SM: Mandado segurança c/ valor: R$ 8.580 (20%)",
    trabalhista: "Reclamante: 30% valor c/ mín. R$ 1.800; Reclamada: 10% c/ mín. R$ 2.990",
    familia: "Divórcio litigioso: R$ 6.570 (10%); Inventário s/ litígio judicial: R$ 6.940 (9%)",
    criminal: "Rito ordinário: R$ 8.580; JECrim: R$ 4.900; Júri: R$ 21.000",
    previdenciario: "Judicial concessão/revisão: 30% c/ mín. R$ 4.000",
    consulta: "R$ 350 (escritório); R$ 620 (hora técnica)",
    fonte: "https://oabac.org.br/wp-content/uploads/2024/08/TABELA-DE-HONORARIOS-2024.pdf",
    obs: "Tabela mais recente (ago/2024). Usa % proveito econ. + mín. fixos."
  },
  "AL": {
    nome: "Alagoas",
    ano: "2025 (minuta/proposta)",
    civel: "Até 20 SM: R$ 1.596,35 (7 URH) - Juizados Cíveis; 20-100 SM: Não especificado; Acima 100 SM: Não especificado",
    trabalhista: "R$ 1.800 - R$ 2.300 (7-10 URH)",
    familia: "Divórcio: R$ 8.000 (consensual c/bens) / R$ 15.000 (litigioso); Inventário: R$ 6.841,50 (30 URH)",
    criminal: "R$ 5.701 (rito sumário, 25 URH); R$ 9.578 (ordinário)",
    previdenciario: "R$ 5.701 (25 URH) ações concessão/revisão",
    consulta: "R$ 228,05 /hora (1 URH)",
    fonte: "https://www.oab-al.org.br/app/uploads/2025/12/TABELA-HONORARIOS-OAB-AL-VF12-1.pdf",
    obs: "URH 2025: R$ 228,05. Minuta dez/2025 em consulta pública."
  },
  "AM": {
    nome: "Amazonas",
    ano: "2020 (mais recente oficial)",
    civel: "Proposição/defesa avulsa: 4,7 SM",
    trabalhista: "20-30% sobre valor econômico (ex: reclamante 1,2 SM fixo mín.)",
    familia: "Divórcio Litigioso: 8,5 SM; Inventário s/ litígio: 4,1 SM / c/ litígio: 5,6 SM",
    criminal: "Rito Ordinário: 8,9 SM; Júri até pronúncia: 12,7 SM",
    previdenciario: "30% sobre 6 parcelas; Justificação judicial: 5 SM",
    consulta: "R$ 998 (1 SM); Hora intelectual: 1 SM",
    fonte: "https://www.oabam.org.br/diretorio/Tabela_2020.pdf",
    obs: "Tabela 2020 (SM=R$998). SM 2026: R$1.621."
  },
  "AP": {
    nome: "Amapá",
    ano: "2025",
    civel: "Procedimento comum: ~R$ 3.762,50",
    trabalhista: "Consulte a tabela oficial",
    familia: "Consulte a tabela oficial",
    criminal: "Consulte a tabela oficial",
    previdenciario: "Consulte a tabela oficial",
    consulta: "Consulte a tabela oficial",
    fonte: "https://www.oabap.org.br/noticias/advocacia-amapaense-ganha-reforco-na-valorizacao-profissional-com-atualizacao-da-tabela-de-honorarios-2025",
    obs: "Tabela 2025 anunciada. Página de download em manutenção. Valores parciais disponíveis."
  },
  "BA": {
    nome: "Bahia",
    ano: "Fevereiro 2026 (URH R$ 268,07)",
    civel: "Procedimento ordinário: R$ 8.042 + 20%",
    trabalhista: "Reclamante: R$ 2.681 (10 URH) + 20%; Reclamado: R$ 6.702 (25 URH) + 20%",
    familia: "Divórcio consensual: R$ 6.702; Litigioso: R$ 10.723; Inventário: R$ 9.383 + 8-10%",
    criminal: "Sumário: R$ 18.765; Comum: R$ 25.467",
    previdenciario: "20-30% de 13 parcelas vincendas + proveito econômico",
    consulta: "R$ 536 (2 URH/hora)",
    fonte: "https://adm.oab-ba.org.br/arquivos/oab_honorarios/26/ARQUIVO_HONORARIO.pdf",
    obs: "URH + % sobre valor econômico. Tabelas mensais atualizadas por IPCA/IGPM."
  },
  "CE": {
    nome: "Ceará",
    ano: "2023 (UAD R$159,21 - Res. 01/2024)",
    civel: "60 UAD (R$9.552,60) proc. ordinário",
    trabalhista: "Reclamante: 15 UAD (R$2.388) +20%; Reclamado: 40 UAD (R$6.368) +20%",
    familia: "Divórcio: 40-130 UAD +6-10%; Inventário: 40-60 UAD +6-10%",
    criminal: "120-240 UAD (R$19.105-R$38.210) conforme procedimento",
    previdenciario: "45-80 UAD (R$7.164-R$12.737) +30% parcelas",
    consulta: "5 UAD/hora (R$796,05); excepcional 10 UAD",
    fonte: "https://oabce.org.br/wp-content/uploads/2024/05/TABELA-DE-HONORARIOS-23032023.pdf",
    obs: "UAD=R$159,21. Valores mínimos fixos em UAD + %."
  },
  "DF": {
    nome: "Distrito Federal",
    ano: "Vigente (Res. 04/2015, URH Mar/2026)",
    civel: "VM 25 URH (R$ 9.395,75; geral cíveis)",
    trabalhista: "VM 20 URH (R$ 7.516,60; reclamação reclamado)",
    familia: "Inventário VM 25 URH (R$ 9.395,75); Divórcio litigioso VM 60 URH (R$ 22.549,80)",
    criminal: "VM 50 URH (R$ 18.791,50; ação penal)",
    previdenciario: "VM 30-40 URH (R$ 11.274,90 - R$ 15.033,20)",
    consulta: "Verbal VM 3 URH (R$ 1.127,49); Hora VM 2 URH/h (R$ 751,66/h)",
    fonte: "https://oabdf.org.br/urh/",
    obs: "URH Mar/2026: R$ 375,83."
  },
  "ES": {
    nome: "Espírito Santo",
    ano: "2024",
    civel: "Até 20 SM: 20 URH; 20-100 SM: 40-80 URH; Acima 100 SM: 10-20% valor da causa",
    trabalhista: "20-30% sobre condenação/acordo",
    familia: "Divórcio: 60-150 URH; Inventário judicial: 36.3 URH/quinhão",
    criminal: "20-100 URH (contravenção a júri)",
    previdenciario: "13-17 URH (concessão/revisão benefícios)",
    consulta: "1.2 URH/hora verbal; 3 URH parecer",
    fonte: "https://oabes.org.br/arquivos/TABELA_OAB_HONORARIOS_NOVO_2.pdf",
    obs: "URH Mar/2026: R$204,45."
  },
  "GO": {
    nome: "Goiás",
    ano: "2025",
    civel: "Execução R$ 2.991 (10%); Embargos R$ 2.242 (10%); geral 5-10% proveito",
    trabalhista: "R$ 2.368 (10% acordo/condenação)",
    familia: "Divórcio consensual: R$ 6.350; Inventário extrajudicial: R$ 6.223 (7%)",
    criminal: "R$ 20.954 rito ordinário",
    previdenciario: "R$ 4.191 judicial (30% benefício)",
    consulta: "R$ 367 consulta; R$ 796 hora técnica",
    fonte: "https://www.oabgo.org.br/wp-content/uploads/2025/04/17027-Tabela-de-Honorarios-Minimos-2025-1.pdf",
    obs: "Valores mínimos fixos ou %. Fonte oficial PDF 2025."
  },
  "MA": {
    nome: "Maranhão",
    ano: "Vigente (minuta 2026 em aprovação)",
    civel: "Procedimentos comuns 20% valor causa, mín. R$ 4.190 - R$ 4.830",
    trabalhista: "Rito Ordinário: R$ 2.900 (reclamante) / R$ 3.680 (defesa), 20% benefício; Execução: R$ 2.790 +10%",
    familia: "Divórcio consensual s/ bens: R$ 4.480; Litigioso: R$ 6.750; Inventário extrajud.: R$ 4.480 (8%)",
    criminal: "Rito Sumário: R$ 8.380; Ordinário: R$ 9.660; Júri: R$ 25.140; HC: R$ 5.190",
    previdenciario: "Admin: mín. R$ 5.500 (30% +12 meses); Judicial: R$ 4.400 - R$ 6.600",
    consulta: "Verbal s/ litígio: R$ 400; c/ litígio: R$ 640; Hora intelectual: R$ 500",
    fonte: "https://www.oabma.org.br/servicos/tabela-de-honorarios",
    obs: "Valores fixos ou % de causa/proveito econômico."
  },
  "MG": {
    nome: "Minas Gerais",
    ano: "2023 (reajustável por IPCA)",
    civel: "R$ 7.000 + 20% do valor da causa",
    trabalhista: "R$ 2.000 (autor) / R$ 3.500 (réu) + 20-30%",
    familia: "Divórcio consensual: R$ 7.000; Inventário consensual: R$ 7.000 + 8%",
    criminal: "R$ 15.000 (defesa procedimento comum)",
    previdenciario: "R$ 5.000 + até 30% do proveito econômico",
    consulta: "R$ 300 (consulta); R$ 700 (hora intelectual)",
    fonte: "https://www.oabmg.org.br/doc/Tabela_Honorarios_Advocaticios_2023.pdf",
    obs: "Tabela homologada dez/2023. Valores mínimos 1ª instância."
  },
  "MS": {
    nome: "Mato Grosso do Sul",
    ano: "2025 (Res. 76/2025)",
    civel: "10%-30% valor causa ou mín. R$ 10.109,09",
    trabalhista: "R$ 2.978,38 a R$ 5.956,75 + 20%-30% proveito",
    familia: "Divórcio: R$ 4.945,84 a R$ 8.657,94; Inventário: R$ 4.945,84 a R$ 7.663,34 + 6%-8%; Alimentos: R$ 3.228,39 a R$ 6.174,15",
    criminal: "R$ 3.076,21 a R$ 37.082,96 (JECrim R$6.630; Júri até R$37k; HC R$4.739)",
    previdenciario: "R$ 7.174,19 + 20%-30% (judicial); admin: 20%-40%",
    consulta: "R$ 619,59 (verbal/hora); Parecer R$1.239-R$3.668",
    fonte: "https://oabms.org.br/wp-content/uploads/2025/09/TABELA-HONORARIOS_2025.pdf",
    obs: "Valores mínimos 2025, atualizáveis por INPC anual."
  },
  "MT": {
    nome: "Mato Grosso",
    ano: "2026 (atualizada 12/03/2026)",
    civel: "20% valor causa + mín. R$ 5.356 (4 URH) ordinário",
    trabalhista: "30% resultado + mín. R$ 2.678 (2 URH) sumaríssimo; R$ 5.356 (4 URH) ordinário",
    familia: "Divórcio amigável: R$ 6.695 (5 URH); Litigioso: 5% + R$ 10.713 (8 URH); Inventário: 5% + R$ 5.356 (4 URH)",
    criminal: "Inquérito: R$ 6.695 (5 URH); Júri completo: R$ 40.172 (30 URH); HC: R$ 8.034 (6 URH)",
    previdenciario: "20% + mín. R$ 4.017 (3 URH) admin; R$ 6.695 (5 URH) judicial",
    consulta: "R$ 669,53 por hora (0,5 URH)",
    fonte: "https://www.oabmt.org.br/admin2/Arquivos/Documentos/202603/PDF70582.pdf",
    obs: "URH = R$ 1.339,07. Valores mínimos."
  },
  "PA": {
    nome: "Pará",
    ano: "2022 (2026 em revisão)",
    civel: "20% valor da causa, mín. R$ 3.211,80",
    trabalhista: "20% condenação/pedido, mín. R$ 1.751,89",
    familia: "Divórcio amigável: R$4.671,70; Inventário: 5% quinhão mín. R$2.846,82",
    criminal: "Processo ordinário: R$10.073,38",
    previdenciario: "Aposentadoria judicial: R$5.319,32",
    consulta: "Hora técnica: R$401,47; Verbal s/ litígio: R$766,45",
    fonte: "https://oabsantarem.org.br/honorarios/TABELA%20DE%20HONORARIOS%20OAB%20PA%202022.pdf",
    obs: "Tabela 2022 (Santarém). Revisão 2025/2026 em andamento."
  },
  "PB": {
    nome: "Paraíba",
    ano: "Resolução 02/CP (circa 2020)",
    civel: "Procedimento ordinário R$ 2.670 mín. + %",
    trabalhista: "R$ 2.883 (reclamação trabalhista)",
    familia: "Divórcio R$ 2.883 a R$ 5.338; Inventário R$ 5.872",
    criminal: "R$ 4.057 a R$ 10.675 dependendo do procedimento",
    previdenciario: "R$ 3.523 (benefícios); mín. R$ 2.456",
    consulta: "R$ 320 (verbal/hora técnica)",
    fonte: "https://portal.oabpb.org.br/wp-content/uploads/2020/06/Resolu%C3%A7%C3%A3o-02-CP-Tabela-de-honor%C3%A1rios_ALTERADO.pdf",
    obs: "URH ~R$34,78. Sem tabela 2025/2026 localizada."
  },
  "PE": {
    nome: "Pernambuco",
    ano: "2025",
    civel: "R$ 5.730,26 (procedimento ordinário, 20%)",
    trabalhista: "R$ 4.160,83 (reclamante); R$ 5.200,72 (reclamado, 20%)",
    familia: "Divórcio consensual: R$ 6.241,89; litigioso: R$ 9.361,55; Inventário: R$ 10.404,00 (5-10%)",
    criminal: "R$ 9.361,55 (defesa procedimento comum)",
    previdenciario: "R$ 5.682,93 (aposentadorias, 20-30%); R$ 4.300,25 (auxílio incapacidade)",
    consulta: "R$ 415,70 (consulta); R$ 415,70/hora intelectual",
    fonte: "https://www.oabpe.org.br/files/institutional/17359095871803-item5extraordinriatabeladehonorrios2025.pdf",
    obs: "Valores mínimos 2025. Usa % sobre valor econômico."
  },
  "PI": {
    nome: "Piauí",
    ano: "2022 (Resolução 08/2022-CP)",
    civel: "Civil ordinário: R$ 5.000 +20%",
    trabalhista: "R$ 3.000 +20% benefício (rito ordinário)",
    familia: "Divórcio s/ bens: R$ 6.500 (consensual)/R$ 8.000 (litigioso); Inventário: R$ 6.000 +5%",
    criminal: "R$ 10.000 (procedimento comum); Júri: R$ 25.500",
    previdenciario: "30% proveito + 6 parcelas (aposentadoria/pensão)",
    consulta: "R$ 300 (verbal); R$ 1.500 (parecer escrito)",
    fonte: "https://www.oabpi.org.br/wp-content/uploads/2024/02/Tabela-honora%CC%81rio-OAB-PI-2.pdf",
    obs: "Valores absolutos em R$. Sem atualizações 2025/2026."
  },
  "PR": {
    nome: "Paraná",
    ano: "2025 (vigente desde 24/01/2025)",
    civel: "10% do valor da causa, mín. R$ 3.073 (sumário) a R$ 3.537 (ordinário)",
    trabalhista: "20% condenação/acordo, mín. R$ 2.305 (reclamado)",
    familia: "Divórcio s/ bens: R$ 4.610; c/ bens: 10%/R$ 6.915; Inventário consensual: 5%/R$ 6.147",
    criminal: "Defesa rito ordinário: R$ 3.113; Júri: R$ 5.074-R$ 7.995",
    previdenciario: "Fase adm.: 20% 1 anuidade; Judicial: 25% condenação",
    consulta: "R$ 456 (escritório); R$ 464 hora técnica",
    fonte: "https://honorarios.oabpr.org.br/wp-content/uploads/2025/01/2025-08-resolucao-de-diretoria.pdf",
    obs: "Reajustados INPC 4,77% 2024. Res. Diretoria 08/2025."
  },
  "RJ": {
    nome: "Rio de Janeiro",
    ano: "2025 (Tabela Indicativa)",
    civel: "Contratos até 40 SM: R$ 1.500; 40-160 SM: R$ 2.500-R$ 3.500; Ordinário: R$ 6.000 mín.",
    trabalhista: "R$ 3.000 (defesa início ação); % condenação mín. R$ 1.000",
    familia: "Divórcio consensual R$ 7.000; litigioso R$ 12.000; Inventário s/ litígio R$ 3.000 + 8%",
    criminal: "Defesa sumário R$ 7.000; comum R$ 10.000; Júri R$ 14.000 mín.",
    previdenciario: "Concessão adm R$ 3.000; judicial R$ 5.000 (atualizado 20% em 2026)",
    consulta: "R$ 300 (fixa); R$ 700/hora",
    fonte: "https://www.oabrj.org.br/sites/default/files/nova_tabela_honorarios_oabrj.pdf",
    obs: "Tabela orientativa. Valores 'Sugestão Média RJ'."
  },
  "RN": {
    nome: "Rio Grande do Norte",
    ano: "2026 (URH R$ 184,05)",
    civel: "Juizado Especial: R$ 2.760,75 (15 URH); Ordinário: R$ 5.521,50 (30 URH); 10% valor causa (mín. R$ 4.601,25)",
    trabalhista: "Reclamação: 10% (mín. R$ 4.601,25 / 25 URH)",
    familia: "Divórcio/inventário: 5-10% (mín. R$ 5.521,50-11.043,00)",
    criminal: "Proced. Ordinário até sentença: R$ 10.122,75 (55 URH)",
    previdenciario: "Judicial: 15% (mín. R$ 11.043,00 / 60 URH)",
    consulta: "R$ 368,10 (2 URH) escritório; R$ 644,18/h (3,5 URH) externa",
    fonte: "https://www.oabrn.org.br/storage/dl3TNqkABmZ2EDc9jodNdvEhSLb9ZwMwPTjEomjC.pdf",
    obs: "URH R$ 184,05. Mais recente (fev/2026)."
  },
  "RO": {
    nome: "Rondônia",
    ano: "2024 (atualiza anualmente por IPCA-E)",
    civel: "Até 20 SM: R$ 4.197,60; 20-50 SM: R$ 5.247,00; 50-100 SM: R$ 8.919,90; Acima: 10%",
    trabalhista: "R$ 1.552,24 ou 20% (reclamante)",
    familia: "Divórcio litigioso: R$ 8.395,20 (s/ bens); Inventário: ver cível",
    criminal: "R$ 13.580,60 (procedimento comum)",
    previdenciario: "R$ 5.247,00 ou 20% (admin aposentadoria)",
    consulta: "R$ 413,02 (hora intelectual ou consulta)",
    fonte: "https://www.oab-ro.org.br/gerenciador/data/uploads/2024/01/NOVA-TABELA-DE-HONORARIOS-OAB-RO-2024.pdf",
    obs: "Tabela 2024. Sem 2025/2026 encontrada."
  },
  "RR": {
    nome: "Roraima",
    ano: "2020 (site oficial sem tabela atualizada)",
    civel: "Consulte a tabela oficial",
    trabalhista: "20% do acordo/condenação",
    familia: "Divórcio: 5-7 URH; Inventário até 20 SM: 2 URH",
    criminal: "Processo sumário: 5 URH; Júri defesa: 28 URH",
    previdenciario: "3 URH + 20-30% vencidas",
    consulta: "Verbal: R$250; Escrita: R$1.500",
    fonte: "https://oabrr.org.br/links-uteis-oab/tabela-de-honorarios/",
    obs: "Valores parciais 2020. Sem tabela 2025/2026."
  },
  "RS": {
    nome: "Rio Grande do Sul",
    ano: "Resolução 02/2015 (reajuste anual IGP-M)",
    civel: "Proc. ordinário mín. R$ 3.000 + 20% valor causa; sumário mín. R$ 1.800",
    trabalhista: "Reclamante R$ 600 (20% condenação); Reclamado R$ 2.000 (20% pedido)",
    familia: "Divórcio consensual R$ 4.000 (+8%); Litigioso R$ 6.000 (+10%); Inventário R$ 3.000 (+8%)",
    criminal: "Defesa sumário R$ 6.000; comum R$ 8.000",
    previdenciario: "Admin R$ 600 (20% 12 parcelas); Judicial R$ 1.600 (+20%)",
    consulta: "R$ 200; hora intelectual R$ 400",
    fonte: "https://admsite.oabrs.org.br/arquivos/2_42_578678616f201.pdf",
    obs: "Res. 02/2015 vigente c/ reajuste IGP-M anual."
  },
  "SC": {
    nome: "Santa Catarina",
    ano: "2025 (Res. CP 04/2025, IPCA dez/2024)",
    civel: "Pisos ~R$3.000 + 10-20% valor causa",
    trabalhista: "20% condenação/acordo, piso R$1.953-R$3.255",
    familia: "Divórcio: R$5.000-8.000 +3-15%; Inventário: 5-20% piso R$5.000-6.000",
    criminal: "R$7.000 (sumário) a R$33.000 (júri plenário)",
    previdenciario: "20-30% ou 1-2 SM/benefício, piso R$3.000",
    consulta: "R$455/h (normal); R$781 (excepcional); R$520 (domicílio)",
    fonte: "https://www.oab-sc.org.br/honorarios",
    obs: "Pisos fixos + % proveito econômico."
  },
  "SE": {
    nome: "Sergipe",
    ano: "2024",
    civel: "Proc. ordinário R$ 3.858,39 mín. ou 10% valor; 20-100 SM: R$ 4.822,98 mín.",
    trabalhista: "Empregado: 20% mín. R$ 3.488,80; Empregador: R$ 1.412 a R$ 7.995,08",
    familia: "Divórcio litigioso: 10% mín. R$ 7.787,59; Inventário: 5% mín. R$ 5.787,59; Alimentos: 20% mín. R$ 3.472,54",
    criminal: "Defesa rito ordinário: R$ 12.602,14; Júri completa: R$ 29.505,33",
    previdenciario: "Concessão judicial: 20% mín. R$ 3.852,17",
    consulta: "R$ 425/hora ou R$ 300 verbal",
    fonte: "https://oabsergipe.org.br/wp-content/uploads/2024/02/Tabela-de-Honorarios-OAB-2024.pdf",
    obs: "Tabela 2024 (pub. 09/02/2024)."
  },
  "SP": {
    nome: "São Paulo",
    ano: "2025",
    civel: "Procedimento ordinário R$ 5.992,22 (20% valor questão)",
    trabalhista: "R$ 1.664,49 (reclamante, 20-30%) / R$ 4.161,27 (reclamado, 20-30%)",
    familia: "Divórcio consensual R$ 7.490,28 / litigioso R$ 11.651,53; Inventário R$ 5.825,77 (+8-10%)",
    criminal: "R$ 15.812,79 (procedimento comum)",
    previdenciario: "R$ 3.355,18 (20-30% proveito econômico)",
    consulta: "Consulta R$ 516,47; Hora R$ 832,25",
    fonte: "https://www.oabsp.org.br/upload/3864390579.pdf",
    obs: "Valores mínimos + % sobre valor econômico. Atualizada anualmente em jan."
  },
  "TO": {
    nome: "Tocantins",
    ano: "2024 (Resolução 05/2024)",
    civel: "Cíveis gerais ~R$ 5.750 (50 URH); 80-100 URH para maiores; Acima: R$ 11.500 +20%",
    trabalhista: "R$ 3.450 até 10 SM; R$ 5.750 (10-30 SM); R$ 9.200 (>30 SM) [30% êxito]",
    familia: "Divórcio: R$ 9.200 (80 URH); Inventário: R$ 11.500 (100 URH) [+20% êxito]",
    criminal: "Habeas Corpus 1ª inst: R$ 2.000-8.000",
    previdenciario: "Defesa administrativa: R$ 5.750 (50 URH)",
    consulta: "Consulte a tabela oficial",
    fonte: "https://diario.oab.org.br/pages/materia/828228",
    obs: "URH = R$ 124,04 (2024). Reajuste anual março/INPC."
  },
};

// ─── UPLOAD CONFIG ────────────────────────────────────────────
const UPLOADS_DIR = path.join(__dirname, 'uploads');
if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOADS_DIR),
  filename: (req, file, cb) => {
    const safe = file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_');
    cb(null, Date.now() + '_' + safe);
  }
});
const upload = multer({
  storage,
  limits: { fileSize: 50 * 1024 * 1024 }, // 50MB
  fileFilter: (req, file, cb) => {
    const allowed = ['.txt', '.pdf', '.md', '.docx'];
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowed.includes(ext)) cb(null, true);
    else cb(new Error('Tipo de arquivo não suportado. Use .txt, .pdf, .md ou .docx'));
  }
});

// ─── BANCO DE DADOS ───────────────────────────────────────────
// DB_PATH permite apontar para um volume persistente no Railway
// Configure DB_PATH=/data/capi.db no Railway + adicione um Volume em /data
const DB_PATH = process.env.DB_PATH || path.join(__dirname, 'capi.db');
const db = new Database(DB_PATH);
console.log('📦 Banco de dados:', DB_PATH);

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    email TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    active INTEGER DEFAULT 1,
    plan_type TEXT DEFAULT 'free',
    plan_expires_at TEXT,
    plan_activated_at TEXT,
    pagarme_subscription_id TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    last_login TEXT,
    reativacao_enviada TEXT
  );

  CREATE TABLE IF NOT EXISTS conversations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    title TEXT DEFAULT 'Nova conversa',
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (user_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    conversation_id INTEGER,
    user_id INTEGER NOT NULL,
    role TEXT NOT NULL,
    content TEXT NOT NULL,
    tokens INTEGER DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (user_id) REFERENCES users(id),
    FOREIGN KEY (conversation_id) REFERENCES conversations(id)
  );

  CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS knowledge_files (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    filename TEXT NOT NULL,
    original_name TEXT NOT NULL,
    file_path TEXT NOT NULL,
    file_size INTEGER DEFAULT 0,
    chunk_count INTEGER DEFAULT 0,
    status TEXT DEFAULT 'processing',
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS knowledge_chunks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    file_id INTEGER NOT NULL,
    chunk_index INTEGER NOT NULL,
    content TEXT NOT NULL,
    embedding TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (file_id) REFERENCES knowledge_files(id)
  );

  CREATE TABLE IF NOT EXISTS user_profiles (
    user_id INTEGER PRIMARY KEY,
    nome TEXT,
    area TEXT,
    cidade TEXT,
    estado TEXT,
    anos_experiencia TEXT,
    tom_preferido TEXT DEFAULT 'equilibrado',
    oab TEXT,
    escritorio TEXT,
    updated_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (user_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS user_memory (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    category TEXT NOT NULL,
    insight TEXT NOT NULL,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (user_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS message_analytics (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER,
    message_type TEXT DEFAULT 'text',
    chip_used TEXT,
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS notifications (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    body TEXT NOT NULL,
    active INTEGER DEFAULT 1,
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS conversation_uploads (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    conversation_id INTEGER,
    user_id INTEGER NOT NULL,
    filename TEXT NOT NULL,
    original_name TEXT NOT NULL,
    file_path TEXT NOT NULL,
    size_bytes INTEGER DEFAULT 0,
    page_count INTEGER,
    extracted_text TEXT,
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS favorites (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    title TEXT NOT NULL,
    content TEXT NOT NULL,
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (user_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS pecas_salvas (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    tipo_peca TEXT,
    descricao TEXT,
    secoes TEXT,
    alertas TEXT,
    plano_b TEXT,
    escolhas_estrategicas TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS ai_usage_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    feature TEXT NOT NULL,
    model TEXT,
    input_tokens INTEGER DEFAULT 0,
    output_tokens INTEGER DEFAULT 0,
    thinking_tokens INTEGER DEFAULT 0,
    estimated_cost_usd REAL DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS audiencia_sessions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    tipo TEXT,
    papel TEXT,
    contexto TEXT,
    dificuldade TEXT DEFAULT 'intermediario',
    fase_atual TEXT DEFAULT 'abertura',
    historico TEXT DEFAULT '[]',
    feedback TEXT,
    nota_geral REAL,
    status TEXT DEFAULT 'ativa',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS conversation_summaries (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    conversation_id INTEGER NOT NULL UNIQUE,
    summary TEXT NOT NULL,
    key_topics TEXT,
    action_items TEXT,
    emotional_tone TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (user_id) REFERENCES users(id),
    FOREIGN KEY (conversation_id) REFERENCES conversations(id)
  );

  CREATE TABLE IF NOT EXISTS user_cases (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    titulo TEXT NOT NULL,
    cliente TEXT,
    area TEXT,
    status TEXT DEFAULT 'ativo',
    detalhes TEXT,
    proximo_passo TEXT,
    prazo TEXT,
    auto_detected INTEGER DEFAULT 1,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (user_id) REFERENCES users(id)
  );
`);

// ─── CAPITREINO: TABELAS ────────────────────────────────────────
db.exec(`
  CREATE TABLE IF NOT EXISTS ct_user_trilha (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    trilha_id TEXT NOT NULL,
    started_at TEXT DEFAULT (datetime('now')),
    completed_at TEXT,
    FOREIGN KEY (user_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS ct_user_progress (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    xp_total INTEGER DEFAULT 0,
    nivel INTEGER DEFAULT 1,
    streak_atual INTEGER DEFAULT 0,
    streak_max INTEGER DEFAULT 0,
    liga TEXT DEFAULT 'bronze',
    liga_xp_semana INTEGER DEFAULT 0,
    liga_semana TEXT,
    missoes_total INTEGER DEFAULT 0,
    missoes_concluidas INTEGER DEFAULT 0,
    ultimo_dia_ativo TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (user_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS ct_missoes_diarias (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    dia TEXT NOT NULL,
    trilha_id TEXT NOT NULL,
    missao_id TEXT NOT NULL,
    titulo TEXT NOT NULL,
    descricao TEXT NOT NULL,
    tipo TEXT NOT NULL,
    formato_conteudo TEXT,
    xp_recompensa INTEGER DEFAULT 50,
    status TEXT DEFAULT 'pendente',
    comprovacao_tipo TEXT DEFAULT 'auto',
    comprovacao_url TEXT,
    concluida_at TEXT,
    ordem INTEGER DEFAULT 1,
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (user_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS ct_baus (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    dia TEXT NOT NULL,
    tipo TEXT DEFAULT 'diario',
    recompensa_xp INTEGER DEFAULT 0,
    recompensa_tipo TEXT,
    aberto INTEGER DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (user_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS capitreino_conquistas (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    badge_id TEXT NOT NULL,
    desbloqueado_em DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, badge_id)
  );

  CREATE TABLE IF NOT EXISTS security_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    event_type TEXT NOT NULL,
    ip TEXT,
    email TEXT,
    details TEXT,
    created_at TEXT DEFAULT (datetime('now'))
  );
`);

// ─── SECURITY: RATE LIMITING & BRUTE FORCE PROTECTION ───────────
// Uses EMAIL as primary key (Railway proxy rotates IPs, so IP-only blocking fails).
// Also tracks by IP/24 subnet as secondary defense.
const loginAttempts = new Map(); // key: email or subnet, value: { count, firstAttempt, blockedUntil }
const LOGIN_MAX_ATTEMPTS = 5;
const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const LOGIN_BLOCK_DURATION_MS = 15 * 60 * 1000;

function getClientIp(req) {
  const forwarded = req.headers['x-forwarded-for'];
  if (forwarded) return forwarded.split(',')[0].trim();
  return req.ip || req.connection?.remoteAddress || 'unknown';
}

function getSubnet(ip) {
  // Extract /24 subnet (e.g., 167.82.142.118 -> 167.82.142)
  const parts = (ip || '').split('.');
  if (parts.length === 4) return parts.slice(0, 3).join('.');
  return ip; // IPv6 or unknown, use full
}

function getLoginKeys(req) {
  // Returns array of keys to check/record: [email, subnet]
  const keys = [];
  const email = req.body?.email?.toLowerCase();
  if (email) keys.push(`email:${email}`);
  const ip = getClientIp(req);
  const subnet = getSubnet(ip);
  if (subnet) keys.push(`subnet:${subnet}`);
  return keys;
}

function loginRateLimiter(req, res, next) {
  const now = Date.now();
  const keys = getLoginKeys(req);
  
  for (const key of keys) {
    const record = loginAttempts.get(key);
    if (record && record.blockedUntil && now < record.blockedUntil) {
      const remainingSec = Math.ceil((record.blockedUntil - now) / 1000);
      const ip = getClientIp(req);
      console.log(`🚫 Login blocked for key ${key} (IP ${ip}) — ${remainingSec}s remaining`);
      try { db.prepare("INSERT INTO security_logs (event_type, ip, email, details) VALUES (?, ?, ?, ?)").run('blocked_ip', ip, req.body?.email || '', `Key: ${key}, blocked — ${remainingSec}s remaining`); } catch(e) {}
      return res.status(429).json({
        error: `Muitas tentativas. Tente novamente em ${Math.ceil(remainingSec / 60)} minutos.`
      });
    }
    // Cleanup expired records
    if (record && (now - record.firstAttempt > LOGIN_WINDOW_MS)) {
      loginAttempts.delete(key);
    }
  }

  next();
}

function recordFailedLogin(ip, email) {
  const now = Date.now();
  const subnet = getSubnet(ip);
  const keys = [];
  if (email) keys.push(`email:${email.toLowerCase()}`);
  if (subnet) keys.push(`subnet:${subnet}`);
  
  for (const key of keys) {
    const record = loginAttempts.get(key) || { count: 0, firstAttempt: now };
    record.count++;
    
    if (record.count >= LOGIN_MAX_ATTEMPTS) {
      record.blockedUntil = now + LOGIN_BLOCK_DURATION_MS;
      console.log(`🔒 Key ${key} BLOCKED after ${record.count} failed attempts`);
      try { db.prepare("INSERT INTO security_logs (event_type, ip, email, details) VALUES (?, ?, ?, ?)").run('blocked_ip', ip, email || '', `Key: ${key}, blocked after ${record.count} attempts`); } catch(e) {}
    }
    
    loginAttempts.set(key, record);
  }
  
  try { db.prepare("INSERT INTO security_logs (event_type, ip, email, details) VALUES (?, ?, ?, ?)").run('failed_login', ip, email || '', `Attempt from subnet ${subnet}`); } catch(e) {}
}

function clearLoginAttempts(ip, email) {
  if (email) loginAttempts.delete(`email:${email.toLowerCase()}`);
  const subnet = getSubnet(ip);
  if (subnet) loginAttempts.delete(`subnet:${subnet}`);
}

// Cleanup login attempts every 30 minutes
setInterval(() => {
  const now = Date.now();
  for (const [key, record] of loginAttempts) {
    if (now - record.firstAttempt > LOGIN_WINDOW_MS * 2) {
      loginAttempts.delete(key);
    }
  }
}, 30 * 60 * 1000);

// General API rate limiter
const apiRateLimit = new Map();
const API_MAX_REQUESTS = 200;
const API_WINDOW_MS = 60 * 1000;

function apiRateLimiter(req, res, next) {
  const key = req.user?.id ? `user:${req.user.id}` : `ip:${req.ip}`;
  const now = Date.now();
  const record = apiRateLimit.get(key);

  if (record && (now - record.windowStart < API_WINDOW_MS)) {
    record.count++;
    if (record.count > API_MAX_REQUESTS) {
      try { db.prepare("INSERT INTO security_logs (event_type, ip, details) VALUES (?, ?, ?)").run('rate_limited', req.ip, `Key: ${key}, count: ${record.count}`); } catch(e) {}
      return res.status(429).json({ error: 'Muitas requisições. Aguarde um momento.' });
    }
  } else {
    apiRateLimit.set(key, { count: 1, windowStart: now });
  }

  next();
}

// Cleanup API rate limit every 5 minutes
setInterval(() => {
  const now = Date.now();
  for (const [key, record] of apiRateLimit) {
    if (now - record.windowStart > API_WINDOW_MS * 2) {
      apiRateLimit.delete(key);
    }
  }
}, 5 * 60 * 1000);

// Cleanup old security logs (keep 7 days)
setInterval(() => {
  try { db.prepare("DELETE FROM security_logs WHERE created_at < datetime('now', '-7 days')").run(); } catch(e) {}
}, 24 * 60 * 1000);

// Input sanitization (XSS prevention for user-generated content)
function sanitizeInput(str) {
  if (typeof str !== 'string') return str;
  return str
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;')
    .trim();
}

// ─── CAPITREINO: CONSTANTES ─────────────────────────────────────
const CT_NIVEIS = [
  { nivel: 1, nome: 'CapiBaby', xp_min: 0, xp_max: 299, emoji: '🍼' },
  { nivel: 2, nome: 'CapiAprendiz', xp_min: 300, xp_max: 999, emoji: '📚' },
  { nivel: 3, nome: 'CapiAdvogado', xp_min: 1000, xp_max: 2499, emoji: '⚖️' },
  { nivel: 4, nome: 'CapiEstrategista', xp_min: 2500, xp_max: 4999, emoji: '🧠' },
  { nivel: 5, nome: 'Capitão', xp_min: 5000, xp_max: 9999, emoji: '🎖️' },
  { nivel: 6, nome: 'CapiMestre', xp_min: 10000, xp_max: 19999, emoji: '👑' },
  { nivel: 7, nome: 'CapiLenda', xp_min: 20000, xp_max: Infinity, emoji: '🏆' }
];

const CT_LIGAS = [
  { id: 'bronze', nome: 'Bronze', cor: '#CD7F32', promo: 10, rebaixa: 0 },
  { id: 'prata', nome: 'Prata', cor: '#C0C0C0', promo: 10, rebaixa: 5 },
  { id: 'ouro', nome: 'Ouro', cor: '#FFD700', promo: 10, rebaixa: 5 },
  { id: 'safira', nome: 'Safira', cor: '#0F52BA', promo: 10, rebaixa: 5 },
  { id: 'rubi', nome: 'Rubi', cor: '#E0115F', promo: 10, rebaixa: 5 },
  { id: 'esmeralda', nome: 'Esmeralda', cor: '#50C878', promo: 10, rebaixa: 5 },
  { id: 'diamante', nome: 'Diamante', cor: '#B9F2FF', promo: 0, rebaixa: 5 }
];

const CT_TRILHAS = [
  { id: 'primeiros_passos', nome: 'Primeiros Passos', descricao: 'Aprenda o básico do Método Cândia e configure sua presença profissional', icone: '🚀', cor: '#4CAF50', pilar: 'geral', ordem: 1 },
  { id: 'advocacia_raiz', nome: 'Advocacia Raiz', descricao: 'Domine postura profissional, networking, reputação e indicações — o pilar 1 do Método Cândia', icone: '🌳', cor: '#8B4513', pilar: 'advocacia_raiz', ordem: 2 },
  { id: 'cacador_clientes', nome: 'Caçador de Clientes', descricao: 'Prospecção ativa em Jusfy, Jusbrasil e plataformas de clientes — pilar 2 do Método', icone: '🎯', cor: '#FF5722', pilar: 'prospeccao', ordem: 3 },
  { id: 'autoridade_digital', nome: 'Autoridade Digital', descricao: 'Produza conteúdo que atrai clientes no Instagram e redes — pilar 3 do Método', icone: '📱', cor: '#9C27B0', pilar: 'conteudo', ordem: 4 },
  { id: 'maquina_anuncios', nome: 'Máquina de Anúncios', descricao: 'Domine Meta Ads e Google Ads para advocacia — pilar 4 do Método', icone: '📢', cor: '#2196F3', pilar: 'trafego', ordem: 5 },
  { id: 'mestre_fechamento', nome: 'Mestre do Fechamento', descricao: 'Atendimento ao cliente, precificação e técnicas de fechamento — seu faturamento depende disso', icone: '🤝', cor: '#FF9800', pilar: 'atendimento', ordem: 6 }
];

const CT_MISSOES_BANCO = [
  // === PRIMEIROS PASSOS ===
  { id: 'pp_01', trilha: 'primeiros_passos', titulo: 'Defina seu nicho de atuação', descricao: 'Escolha 1 a 3 áreas do Direito para se especializar. Use o chat da Capi para pedir ajuda na escolha.', tipo: 'estrategia', formato_conteudo: null, xp: 40, comprovacao: 'auto', dica: 'Vá no chat da Capi e pergunte: "Me ajude a escolher meu nicho de atuação como advogado". A IA vai te guiar.' },
  { id: 'pp_02', trilha: 'primeiros_passos', titulo: 'Crie sua bio profissional', descricao: 'Escreva uma bio profissional para suas redes sociais usando a Capi.', tipo: 'conteudo', formato_conteudo: null, xp: 40, comprovacao: 'auto', dica: 'Peça para a Capi: "Crie uma bio profissional para meu Instagram de advogado na área [sua área]"' },
  { id: 'pp_03', trilha: 'primeiros_passos', titulo: 'Organize sua agenda semanal', descricao: 'Crie um planejamento semanal de atividades de captação e produção de conteúdo.', tipo: 'estrategia', formato_conteudo: null, xp: 50, comprovacao: 'auto', dica: 'Use a Capi para criar seu planejamento: "Monte uma agenda semanal para advogado que quer captar clientes"' },
  { id: 'pp_04', trilha: 'primeiros_passos', titulo: 'Explore a Capi', descricao: 'Faça pelo menos 3 perguntas diferentes para a Capi sobre sua área de atuação.', tipo: 'exploracao', formato_conteudo: null, xp: 30, comprovacao: 'auto', dica: 'Pergunte sobre teses, estratégias, modelos de petição... a Capi tem 94 documentos de referência.' },
  { id: 'pp_05', trilha: 'primeiros_passos', titulo: 'Defina suas metas do mês', descricao: 'Estabeleça metas claras: quantos clientes quer, quanto quer faturar, quantos conteúdos vai produzir.', tipo: 'estrategia', formato_conteudo: null, xp: 50, comprovacao: 'auto', dica: 'Peça à Capi: "Me ajude a definir metas realistas para um advogado que está começando a captar clientes"' },
  // === ADVOCACIA RAIZ ===
  { id: 'ar_01', trilha: 'advocacia_raiz', titulo: 'Mapeie sua rede de indicações', descricao: 'Liste 10 profissionais que podem te indicar clientes (outros advogados, contadores, corretores, etc).', tipo: 'estrategia', formato_conteudo: null, xp: 50, comprovacao: 'auto', dica: 'Pense em quem convive com seu público-alvo. Contadores indicam para tributário, corretores para imobiliário.' },
  { id: 'ar_02', trilha: 'advocacia_raiz', titulo: 'Envie mensagem para 3 indicadores', descricao: 'Escolha 3 pessoas da sua lista e envie uma mensagem profissional se apresentando e oferecendo parceria.', tipo: 'networking', formato_conteudo: null, xp: 60, comprovacao: 'print', dica: 'Use a Capi para redigir a mensagem: "Escreva uma mensagem de parceria profissional para um contador"' },
  { id: 'ar_03', trilha: 'advocacia_raiz', titulo: 'Atualize seu perfil da OAB', descricao: 'Verifique se seu cadastro na OAB está atualizado com endereço, telefone e áreas de atuação.', tipo: 'organizacao', formato_conteudo: null, xp: 40, comprovacao: 'print', dica: 'Acesse o site da OAB da sua seccional e atualize seu cadastro.' },
  { id: 'ar_04', trilha: 'advocacia_raiz', titulo: 'Crie seu cartão digital', descricao: 'Crie um cartão de visitas digital profissional para enviar por WhatsApp.', tipo: 'conteudo', formato_conteudo: null, xp: 50, comprovacao: 'print', dica: 'Use Canva ou peça à Capi um texto para seu cartão digital de advogado.' },
  { id: 'ar_05', trilha: 'advocacia_raiz', titulo: 'Participe de um grupo de networking', descricao: 'Entre em pelo menos 1 grupo de WhatsApp ou Telegram de advogados ou empreendedores da sua cidade.', tipo: 'networking', formato_conteudo: null, xp: 40, comprovacao: 'print', dica: 'Busque no Google: "grupo WhatsApp advogados [sua cidade]" ou pergunte em redes sociais.' },
  { id: 'ar_06', trilha: 'advocacia_raiz', titulo: 'Estude uma tese escalável', descricao: 'Use a Capi para pesquisar uma tese jurídica escalável na sua área e entenda como aplicá-la.', tipo: 'estudo', formato_conteudo: null, xp: 60, comprovacao: 'auto', dica: 'Pergunte: "Quais as melhores teses escaláveis em [direito do consumidor/trabalhista/etc]?"' },
  // === CAÇADOR DE CLIENTES ===
  { id: 'cc_01', trilha: 'cacador_clientes', titulo: 'Cadastre-se na Jusfy', descricao: 'Crie seu perfil completo na Jusfy com foto profissional, áreas de atuação e descrição atrativa.', tipo: 'prospeccao', formato_conteudo: null, xp: 50, comprovacao: 'print', dica: 'Acesse jusfy.com.br e crie seu perfil. Use a Capi para escrever sua descrição profissional.' },
  { id: 'cc_02', trilha: 'cacador_clientes', titulo: 'Responda 3 perguntas no Jusbrasil', descricao: 'Encontre 3 perguntas na sua área de atuação e responda de forma completa e estratégica.', tipo: 'prospeccao', formato_conteudo: null, xp: 60, comprovacao: 'print', dica: 'Vá no Jusbrasil, seção de Perguntas. Responda com autoridade. Isso gera visibilidade e clientes.' },
  { id: 'cc_03', trilha: 'cacador_clientes', titulo: 'Prospecte 5 clientes ativamente', descricao: 'Identifique 5 potenciais clientes e envie uma mensagem de abordagem profissional.', tipo: 'prospeccao', formato_conteudo: null, xp: 80, comprovacao: 'print', dica: 'Use a Capi: "Escreva uma mensagem de prospecção para cliente que precisa de advogado de [área]"' },
  { id: 'cc_04', trilha: 'cacador_clientes', titulo: 'Crie um script de atendimento', descricao: 'Desenvolva um roteiro para sua primeira conversa com um lead que chega pelo WhatsApp.', tipo: 'atendimento', formato_conteudo: null, xp: 60, comprovacao: 'auto', dica: 'Peça à Capi: "Crie um script de primeiro atendimento para advogado que recebe leads pelo WhatsApp"' },
  { id: 'cc_05', trilha: 'cacador_clientes', titulo: 'Analise seus concorrentes', descricao: 'Pesquise 3 advogados da sua área na sua cidade e analise como eles captam clientes.', tipo: 'estrategia', formato_conteudo: null, xp: 50, comprovacao: 'auto', dica: 'Busque no Google e Instagram. Observe: que tipo de conteúdo fazem? Estão na Jusfy? Têm Google Ads?' },
  // === AUTORIDADE DIGITAL ===
  { id: 'ad_01', trilha: 'autoridade_digital', titulo: 'Grave um Reels React', descricao: 'Grave um Reels no formato React: reaja a uma notícia jurídica ou situação do dia a dia.', tipo: 'conteudo', formato_conteudo: 'react', xp: 70, comprovacao: 'print', dica: 'Peça à Capi: "Crie um roteiro de Reels React sobre [tema jurídico]. Formato: reação natural + explicação"' },
  { id: 'ad_02', trilha: 'autoridade_digital', titulo: 'Crie um carrossel educativo', descricao: 'Crie um carrossel de 5-8 slides explicando um direito que as pessoas não conhecem.', tipo: 'conteudo', formato_conteudo: 'carrossel', xp: 70, comprovacao: 'print', dica: 'Use a Capi: "Crie um carrossel educativo sobre [tema]. 7 slides com linguagem simples e gancho forte"' },
  { id: 'ad_03', trilha: 'autoridade_digital', titulo: 'Poste 3 Stories estratégicos', descricao: 'Poste 3 Stories hoje: 1 bastidor, 1 dica rápida, 1 enquete sobre um tema jurídico.', tipo: 'conteudo', formato_conteudo: 'bastidores', xp: 50, comprovacao: 'print', dica: 'Stories de bastidor humanizam. Mostre seu escritório, seu estudo, sua rotina. A Capi pode criar os textos.' },
  { id: 'ad_04', trilha: 'autoridade_digital', titulo: 'Grave um vídeo Professoral', descricao: 'Grave um vídeo curto explicando um conceito jurídico como se estivesse dando aula.', tipo: 'conteudo', formato_conteudo: 'professoral', xp: 70, comprovacao: 'print', dica: 'Peça roteiro: "Crie um roteiro de vídeo professoral explicando [conceito] de forma simples para leigos"' },
  { id: 'ad_05', trilha: 'autoridade_digital', titulo: 'Crie um post de Storytelling', descricao: 'Escreva um post contando uma história real (anonimizada) de um caso que resolveu.', tipo: 'conteudo', formato_conteudo: 'storytelling', xp: 60, comprovacao: 'print', dica: 'Storytelling vende. Peça à Capi: "Crie um post de storytelling sobre um caso de [área] com final positivo"' },
  { id: 'ad_06', trilha: 'autoridade_digital', titulo: 'Faça um post FAQ', descricao: 'Responda as 3 perguntas mais frequentes que seus clientes fazem, em formato de post.', tipo: 'conteudo', formato_conteudo: 'faq', xp: 50, comprovacao: 'print', dica: 'Peça: "Crie um post FAQ com as 3 dúvidas mais comuns sobre [sua área de atuação]"' },
  { id: 'ad_07', trilha: 'autoridade_digital', titulo: 'Crie um Reels POV', descricao: 'Grave um Reels no formato POV: "POV: você descobriu que [situação jurídica]"', tipo: 'conteudo', formato_conteudo: 'pov', xp: 70, comprovacao: 'print', dica: 'POVs viralizam. Peça roteiro: "Crie um roteiro de Reels POV sobre [situação jurídica comum]"' },
  { id: 'ad_08', trilha: 'autoridade_digital', titulo: 'Post de Autoridade', descricao: 'Crie um post mostrando um resultado ou conquista profissional (audiência ganha, tese aprovada, etc).', tipo: 'conteudo', formato_conteudo: 'autoridade', xp: 60, comprovacao: 'print', dica: 'Mostre resultados reais. "Conseguimos reverter X para o cliente Y". Isso gera confiança.' },
  { id: 'ad_09', trilha: 'autoridade_digital', titulo: 'Imagem + Música + Frase', descricao: 'Crie um Reels com imagem impactante, música de fundo e uma frase jurídica poderosa.', tipo: 'conteudo', formato_conteudo: 'imagem_musica_frase', xp: 50, comprovacao: 'print', dica: 'Formato fácil e viral. Escolha uma frase forte sobre direito e coloque sobre uma imagem profissional.' },
  { id: 'ad_10', trilha: 'autoridade_digital', titulo: 'Crie um post de Comparação', descricao: 'Faça um post comparando dois conceitos jurídicos que as pessoas confundem.', tipo: 'conteudo', formato_conteudo: 'comparacao', xp: 50, comprovacao: 'print', dica: 'Ex: "Dano moral vs Dano material: qual a diferença?" — Peça à Capi para criar o comparativo.' },
  { id: 'ad_11', trilha: 'autoridade_digital', titulo: 'Tutorial em série (Parte 1)', descricao: 'Inicie uma série de 3 vídeos tutoriais sobre um tema da sua área. Grave a parte 1 hoje.', tipo: 'conteudo', formato_conteudo: 'tutorial_serie', xp: 80, comprovacao: 'print', dica: 'Séries geram expectativa e seguidores. Peça à Capi o roteiro completo da série de 3 partes.' },
  { id: 'ad_12', trilha: 'autoridade_digital', titulo: 'Post Provoca DM', descricao: 'Crie um post que termine com: "Comenta EU QUERO que eu te mando o material completo".', tipo: 'conteudo', formato_conteudo: 'provoca_dm', xp: 60, comprovacao: 'print', dica: 'Isso gera leads direto no DM. Use: "Preparei um guia sobre [tema]. Quer? Comenta EU QUERO."' },
  // === MÁQUINA DE ANÚNCIOS ===
  { id: 'ma_01', trilha: 'maquina_anuncios', titulo: 'Configure o Pixel do Facebook', descricao: 'Instale o Pixel do Meta no seu site ou landing page para rastrear conversões.', tipo: 'trafego', formato_conteudo: null, xp: 60, comprovacao: 'print', dica: 'Acesse business.facebook.com > Gerenciador de Eventos. A Capi pode te guiar passo a passo.' },
  { id: 'ma_02', trilha: 'maquina_anuncios', titulo: 'Crie sua primeira campanha no Meta', descricao: 'Crie uma campanha de mensagens no Meta Ads direcionando para seu WhatsApp.', tipo: 'trafego', formato_conteudo: null, xp: 80, comprovacao: 'print', dica: 'Campanha de Mensagens > WhatsApp. Segmentação por cidade + interesse em "advogado" ou sua área.' },
  { id: 'ma_03', trilha: 'maquina_anuncios', titulo: 'Escreva 3 copies para anúncios', descricao: 'Crie 3 variações de texto para anúncios de advocacia usando a Capi.', tipo: 'conteudo', formato_conteudo: null, xp: 60, comprovacao: 'auto', dica: 'Peça: "Crie 3 copies para anúncio de advogado [sua área] no Meta Ads. Foque em dor do cliente."' },
  { id: 'ma_04', trilha: 'maquina_anuncios', titulo: 'Analise métricas da campanha', descricao: 'Verifique CTR, CPC e custo por lead da sua campanha ativa e identifique o que melhorar.', tipo: 'analise', formato_conteudo: null, xp: 50, comprovacao: 'print', dica: 'Se não tem campanha ainda, estude os termos: CTR = taxa de clique, CPC = custo por clique, CPL = custo por lead.' },
  { id: 'ma_05', trilha: 'maquina_anuncios', titulo: 'Crie uma landing page simples', descricao: 'Crie uma página de captura simples para receber leads dos seus anúncios.', tipo: 'trafego', formato_conteudo: null, xp: 70, comprovacao: 'print', dica: 'Pode usar Canva, Google Sites ou qualquer ferramenta. A Capi pode escrever o texto.' },
  // === MESTRE DO FECHAMENTO ===
  { id: 'mf_01', trilha: 'mestre_fechamento', titulo: 'Crie sua tabela de honorários', descricao: 'Defina seus valores para os serviços mais comuns da sua área de atuação.', tipo: 'precificacao', formato_conteudo: null, xp: 60, comprovacao: 'auto', dica: 'Use a Capi: "Me ajude a criar uma tabela de honorários para advogado de [área] em [cidade]". Consulte a tabela da OAB.' },
  { id: 'mf_02', trilha: 'mestre_fechamento', titulo: 'Pratique uma objeção', descricao: 'Use a Capi para simular um cliente que diz "tá caro" e pratique a resposta.', tipo: 'atendimento', formato_conteudo: null, xp: 50, comprovacao: 'auto', dica: 'Peça: "Simule um cliente que acha meus honorários caros. Eu quero praticar a resposta."' },
  { id: 'mf_03', trilha: 'mestre_fechamento', titulo: 'Crie uma proposta de honorários', descricao: 'Monte uma proposta profissional de honorários para enviar ao próximo cliente.', tipo: 'precificacao', formato_conteudo: null, xp: 60, comprovacao: 'auto', dica: 'Peça à Capi: "Crie uma proposta de honorários profissional para um caso de [tipo]"' },
  { id: 'mf_04', trilha: 'mestre_fechamento', titulo: 'Script de follow-up', descricao: 'Crie um script de follow-up para clientes que pediram proposta mas não retornaram.', tipo: 'atendimento', formato_conteudo: null, xp: 50, comprovacao: 'auto', dica: 'Follow-up é onde está o dinheiro. Peça: "Crie 3 mensagens de follow-up para cliente que sumiu após receber proposta"' },
  { id: 'mf_05', trilha: 'mestre_fechamento', titulo: 'Simule um atendimento completo', descricao: 'Use a Capi para simular um atendimento completo: da primeira mensagem ao fechamento.', tipo: 'atendimento', formato_conteudo: null, xp: 80, comprovacao: 'auto', dica: 'Peça: "Simule que você é um cliente que precisa de advogado. Vou praticar todo o atendimento até o fechamento."' }
];

const CT_MISSOES_SEXTA = [
  { id: 'sex_01', titulo: 'Missão Secreta de Fechamento', descricao: 'Hoje é sexta! Envie uma mensagem de follow-up para um lead que não converteu esta semana.', tipo: 'fechamento', xp: 100, comprovacao: 'print', dica: 'Sexta é dia de fechar. Revise seus leads da semana e mande uma última mensagem estratégica.' },
  { id: 'sex_02', titulo: 'Prepare o fechamento da semana', descricao: 'Revise todos os leads que entraram essa semana e crie uma estratégia de fechamento para cada um.', tipo: 'fechamento', xp: 100, comprovacao: 'auto', dica: 'Use a Capi: "Me ajude a criar estratégias de fechamento para os leads desta semana"' }
];

// ─── CAPITREINO: BADGES ─────────────────────────────────────────
const CT_BADGES = [
  { id: 'primeira_missao', nome: 'Primeira Missao', descricao: 'Completou sua primeira missao', imagem: 'badge_primeira_missao', threshold: { type: 'missions_total', value: 1 } },
  { id: 'streak_7', nome: 'Fogo Sagrado', descricao: 'Manteve uma sequencia de 7 dias', imagem: 'badge_streak_7', threshold: { type: 'streak', value: 7 } },
  { id: 'streak_30', nome: 'Imparavel', descricao: 'Manteve uma sequencia de 30 dias', imagem: 'badge_streak_30', threshold: { type: 'streak', value: 30 } },
  { id: 'mestre_xp', nome: 'Mestre XP', descricao: 'Acumulou 1.000 XP', imagem: 'badge_mestre_xp', threshold: { type: 'xp_total', value: 1000 } },
  { id: 'maratonista', nome: 'Maratonista', descricao: 'Completou todas as missoes em um dia', imagem: 'badge_maratonista', threshold: { type: 'all_daily', value: 1 } },
  { id: 'campeao_liga', nome: 'Campeao da Liga', descricao: 'Terminou em 1 lugar na liga semanal', imagem: 'badge_campeao_liga', threshold: { type: 'liga_first', value: 1 } }
];

function ctCheckAndAwardBadges(userId) {
  const prog = ctGetOrCreateProgress(userId);
  const hoje = ctHoje();
  const awarded = [];
  const existing = db.prepare('SELECT badge_id FROM capitreino_conquistas WHERE user_id = ?').all(userId).map(r => r.badge_id);

  for (const badge of CT_BADGES) {
    if (existing.includes(badge.id)) continue;
    let earned = false;
    switch (badge.threshold.type) {
      case 'missions_total':
        earned = (prog.missoes_concluidas || 0) >= badge.threshold.value;
        break;
      case 'streak':
        earned = (prog.streak_atual || 0) >= badge.threshold.value;
        break;
      case 'xp_total':
        earned = (prog.xp_total || 0) >= badge.threshold.value;
        break;
      case 'all_daily': {
        const trilha = ctGetTrilhaAtiva(userId);
        if (trilha) {
          const missoesDia = db.prepare("SELECT COUNT(*) as total, SUM(CASE WHEN status = 'concluida' THEN 1 ELSE 0 END) as concluidas FROM ct_missoes_diarias WHERE user_id = ? AND dia = ? AND trilha_id = ?").get(userId, hoje, trilha.trilha_id);
          earned = missoesDia.total > 0 && missoesDia.concluidas === missoesDia.total;
        }
        break;
      }
      case 'liga_first': {
        const semana = ctSemanaAtual();
        const topUser = db.prepare('SELECT user_id FROM ct_user_progress WHERE liga = ? AND liga_semana = ? ORDER BY liga_xp_semana DESC LIMIT 1').get(prog.liga, semana);
        earned = topUser && topUser.user_id === userId;
        break;
      }
    }
    if (earned) {
      try {
        db.prepare('INSERT OR IGNORE INTO capitreino_conquistas (user_id, badge_id) VALUES (?, ?)').run(userId, badge.id);
        awarded.push(badge);
      } catch (e) { /* ignore duplicate */ }
    }
  }
  return awarded;
}

// ─── CAPITREINO: HELPERS ────────────────────────────────────────
function ctGetNivel(xp) {
  return CT_NIVEIS.find(n => xp >= n.xp_min && xp <= n.xp_max) || CT_NIVEIS[0];
}

function ctGetOrCreateProgress(userId) {
  let prog = db.prepare('SELECT * FROM ct_user_progress WHERE user_id = ?').get(userId);
  if (!prog) {
    db.prepare('INSERT INTO ct_user_progress (user_id) VALUES (?)').run(userId);
    prog = db.prepare('SELECT * FROM ct_user_progress WHERE user_id = ?').get(userId);
  }
  return prog;
}

function ctGetTrilhaAtiva(userId) {
  return db.prepare('SELECT * FROM ct_user_trilha WHERE user_id = ? AND completed_at IS NULL ORDER BY started_at DESC LIMIT 1').get(userId);
}

function ctHoje() {
  return new Date().toISOString().split('T')[0];
}

function ctSemanaAtual() {
  const d = new Date();
  const onejan = new Date(d.getFullYear(), 0, 1);
  const weekNum = Math.ceil(((d - onejan) / 86400000 + onejan.getDay() + 1) / 7);
  return `${d.getFullYear()}-W${String(weekNum).padStart(2, '0')}`;
}

function ctGerarMissoesDiarias(userId, trilhaId) {
  const hoje = ctHoje();
  // Check if missions already exist for TODAY and THIS TRILHA
  const existing = db.prepare('SELECT COUNT(*) as c FROM ct_missoes_diarias WHERE user_id = ? AND dia = ? AND trilha_id = ?').get(userId, hoje, trilhaId);
  if (existing.c > 0) {
    return db.prepare('SELECT * FROM ct_missoes_diarias WHERE user_id = ? AND dia = ? AND trilha_id = ? ORDER BY ordem').all(userId, hoje, trilhaId);
  }
  // Delete old missions from today if they were from a different trilha (user switched trilha)
  db.prepare("DELETE FROM ct_missoes_diarias WHERE user_id = ? AND dia = ? AND status != 'concluida'").run(userId, hoje);
  const done = db.prepare("SELECT missao_id FROM ct_missoes_diarias WHERE user_id = ? AND status = 'concluida'").all(userId).map(r => r.missao_id);
  let pool = CT_MISSOES_BANCO.filter(m => m.trilha === trilhaId && !done.includes(m.id));
  if (pool.length < 3) {
    pool = CT_MISSOES_BANCO.filter(m => m.trilha === trilhaId);
  }
  const shuffled = pool.sort(() => Math.random() - 0.5);
  let selected = shuffled.slice(0, 3);
  const dayOfWeek = new Date().getDay();
  if (dayOfWeek === 5 && trilhaId !== 'mestre_fechamento') {
    const sextaMissao = CT_MISSOES_SEXTA[Math.floor(Math.random() * CT_MISSOES_SEXTA.length)];
    selected[2] = { id: sextaMissao.id, trilha: trilhaId, titulo: sextaMissao.titulo, descricao: sextaMissao.descricao, tipo: sextaMissao.tipo, formato_conteudo: null, xp: sextaMissao.xp, comprovacao: sextaMissao.comprovacao, dica: sextaMissao.dica };
  }
  const insert = db.prepare('INSERT INTO ct_missoes_diarias (user_id, dia, trilha_id, missao_id, titulo, descricao, tipo, formato_conteudo, xp_recompensa, comprovacao_tipo, ordem) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
  selected.forEach((m, i) => {
    insert.run(userId, hoje, trilhaId, m.id, m.titulo, m.descricao, m.tipo, m.formato_conteudo || null, m.xp, m.comprovacao, i + 1);
  });
  db.prepare('INSERT OR IGNORE INTO ct_baus (user_id, dia, tipo, recompensa_xp) VALUES (?, ?, ?, ?)').run(userId, hoje, 'diario', 50);
  return db.prepare('SELECT * FROM ct_missoes_diarias WHERE user_id = ? AND dia = ? ORDER BY ordem').all(userId, hoje);
}

// ─── AI USAGE LOGGING ───────────────────────────────────────
function logAiUsage(userId, feature, model, inputTokens, outputTokens, thinkingTokens, costUsd) {
  try {
    db.prepare('INSERT INTO ai_usage_log (user_id, feature, model, input_tokens, output_tokens, thinking_tokens, estimated_cost_usd) VALUES (?, ?, ?, ?, ?, ?, ?)').run(userId, feature, model, inputTokens || 0, outputTokens || 0, thinkingTokens || 0, costUsd || 0);
  } catch(e) { console.error('Log AI usage error:', e.message); }
}

// Migração: adiciona colunas novas à tabela user_profiles se ainda não existirem
const userProfileCols = db.prepare("PRAGMA table_info(user_profiles)").all().map(c => c.name);
if (!userProfileCols.includes('estado')) db.prepare('ALTER TABLE user_profiles ADD COLUMN estado TEXT').run();
if (!userProfileCols.includes('tom_preferido')) db.prepare("ALTER TABLE user_profiles ADD COLUMN tom_preferido TEXT DEFAULT 'equilibrado'").run();
if (!userProfileCols.includes('oab')) db.prepare('ALTER TABLE user_profiles ADD COLUMN oab TEXT').run();
if (!userProfileCols.includes('escritorio')) db.prepare('ALTER TABLE user_profiles ADD COLUMN escritorio TEXT').run();

// Migração: user_memory extras
try { db.prepare('ALTER TABLE user_memory ADD COLUMN relevance_score REAL DEFAULT 1.0').run(); } catch(e) {}
try { db.prepare('ALTER TABLE user_memory ADD COLUMN access_count INTEGER DEFAULT 0').run(); } catch(e) {}
try { db.prepare('ALTER TABLE user_memory ADD COLUMN source TEXT DEFAULT "chat"').run(); } catch(e) {}

// Migração: conversation_uploads extras (size_bytes, page_count)
try { db.prepare('ALTER TABLE conversation_uploads ADD COLUMN size_bytes INTEGER DEFAULT 0').run(); } catch(e) {}
try { db.prepare('ALTER TABLE conversation_uploads ADD COLUMN page_count INTEGER').run(); } catch(e) {}

// Inserir prompt padrão se não existir
const existingPrompt = db.prepare("SELECT value FROM settings WHERE key = 'system_prompt'").get();
if (!existingPrompt) {
  const DEFAULT_PROMPT = `Você é o Capi Când-IA Pro, um agente de inteligência artificial avançado, criado por Rafael Cândia, advogado, mentor e fundador da Comunidade Capi Cândia.

Sua missão é ser o braço estratégico do Rafael, ajudando advogados aprovados no CapVeste ou convidados pessoais dele a se posicionarem, prospectarem clientes e aplicarem teses jurídicas lucrativas com ética e consistência.

PERSONALIDADE E TOM DE VOZ:
- Fala como Rafael Cândia falaria — humano, direto, empático
- Usa expressões como: "papi", "meu patrão", "capivarístico", "AUUUU!"
- Pode puxar a orelha com humor (modo PapiCrítico™)
- Se adapta ao estilo do usuário
- Usa histórias reais do Rafael: brigadeiro, carreta da justiça, TDAH, FIES, venda de celular
- Nunca enrola, vai direto ao ponto
- Usa emojis com moderação e propósito

O MÉTODO CAPI CÂNDIA (6 PILARES):
1. Advocacia Raiz — Postura tradicional, autoridade local, indicações e reputação sólida
2. Sites de Prospecção — JusBrasil, Jusfy, GetNinjas, Elevia (filtragem, conversa e fechamento)
3. Marketing Jurídico — Conteúdo estratégico, storytelling, vencer a vergonha, gerar autoridade
4. Tráfego Pago — Meta Ads e Google Ads para escalar com responsabilidade
5. Atendimento e Precificação — Os 15 passos do atendimento poderoso
6. Inteligência Emocional e Posicionamento — Consistência, gestão emocional, rotina capivarística

OS 15 PASSOS DO ATENDIMENTO:
1. Avaliação prévia do cliente (condição financeira, origem)
2. Presencial ou videochamada
3. Apresentação e quebra-gelo
4. Seja um camaleão (adapte-se ao cliente)
5. Deixe o cliente falar
6. Não interrompa o cliente
7. Tenha empatia após o cliente terminar
8. Faça perguntas pontuais
9. Apresente a solução
10. Deixe o cliente tirar dúvidas
11. TPP — Tensão Pré-Preço
12. Precificação (NUNCA passe orçamento por WhatsApp)
13. Como precificar (tabela OAB + condição do cliente)
14. Formas de pagamento flexíveis
15. Fechamento

FRASES-CHAVE:
- "AUUUU! Isso aqui é papo reto de capivara raiz."
- "Vergonha não paga boleto."
- "Não se posicionar é ser invisível. E advogado invisível não fatura."
- "Vai reclamar ou vai virar referência na sua cidade?"
- "Capivara que anda em bando não fica comida de onça."

FORMATO DAS TESES JURÍDICAS:
Quando solicitado, entregue neste padrão:
📚 Categoria: [Área do Direito]
🏷️ Subcategoria: [Tema]
⚖️ Tese Jurídica: [Título]
👥 Público-alvo: [Perfil do cliente]
🎯 Ideia de Reels/Carrossel: [Ideia de conteúdo educativo]
📝 Legenda educativa: [Texto informativo sem captação direta]
#️⃣ Hashtags: [5-8 hashtags relevantes]
💬 Script de atendimento: [Para quem JÁ chegou até você, não abordagem fria]
🏷️ Tags: [Área | Tema | Complexidade]

⚠️ REGRAS ÉTICAS OAB (Provimento 205/2021 + Código de Ética):
- NUNCA sugerir copy de captação direta de clientela (Art. 7º CED / Art. 2º VIII Prov. 205)
- NUNCA sugerir Google Ads com keywords de captação
- NUNCA sugerir abordagem ativa de leads frios via WhatsApp
- NUNCA prometer resultados financeiros ou chances de ganho
- NUNCA usar linguagem persuasiva de autoengrandecimento (Art. 3º IV Prov. 205)
- Conteúdo deve ser EDUCATIVO e INFORMATIVO, nunca mercantilizador
- Scripts de WhatsApp: apenas para quem JÁ entrou em contato (publicidade passiva)
- Sempre alertar sobre complexidade técnica quando necessário

Lema: "Capivara que anda em bando não fica comida de onça."`;
  db.prepare("INSERT INTO settings (key, value) VALUES ('system_prompt', ?)").run(DEFAULT_PROMPT);
}

// ─── AUTO-SEED: restaura dados essenciais se o banco estiver vazio ──
(async () => {
  try {
    const userCount = db.prepare('SELECT COUNT(*) as c FROM users').get().c;
    if (userCount === 0) {
      console.log('📦 Banco vazio detectado — rodando seed automático...');
      const hashRafael = await bcrypt.hash('capi2026', 10);
      const hashMarcos = await bcrypt.hash('teste2026', 10);
      db.prepare('INSERT OR IGNORE INTO users (name, email, password, active) VALUES (?, ?, ?, 1)')
        .run('Rafael Cândia', 'rafaelcandia.cj@gmail.com', hashRafael);
      db.prepare('INSERT OR IGNORE INTO users (name, email, password, active) VALUES (?, ?, ?, 1)')
        .run('Dr. Marcos Henrique Souza', 'marcos.souza.adv@gmail.com', hashMarcos);
      console.log('✅ Usuários seed criados (Rafael + Dr. Marcos)');
    }
    // Garante system prompt completo a cada deploy
    const sp = db.prepare("SELECT value FROM settings WHERE key = 'system_prompt'").get();
    if (!sp || !sp.value || sp.value.length < 1500) {
      const SEED_PROMPT = `Você é o Capi Când-IA Pro, um agente de inteligência artificial avançado, criado por Rafael Cândia, advogado (OAB/MS 23.215), palestrante, mentor e fundador da Comunidade Capi Cândia — a maior comunidade de advocacia prática do Brasil, com +7.000 advogados.

Sua missão é ser o braço estratégico do Rafael, ajudando advogados da Comunidade Capi Cândia a se posicionarem, prospectarem clientes e aplicarem teses jurídicas lucrativas com ética e consistência.

🚫 ESCOPO DE ATUAÇÃO (REGRA ABSOLUTA):
Você SOMENTE responde sobre temas relacionados a:
- Direito (todas as áreas: Trabalhista, Família, Previdenciário, Cível, Criminal, Tributário, Empresarial, Consumidor, etc.)
- Advocacia, OAB, carreira jurídica
- Marketing jurídico e posicionamento para advogados
- Atendimento, precificação e gestão de escritório
- Empreendedorismo e gestão para advogados
- Conteúdo e estratégias digitais para advogados
- O Método Capi Cândia e seus pilares

Se o usuário perguntar qualquer coisa FORA desse escopo (ex: receitas, clima, esporte, entretenimento, tecnologia geral, dicas de viagem, cardápios de restaurante, etc.), responda SEMPRE assim (adaptando o tom ao contexto):
"Papi, isso aqui é o QG jurídico do Rafael Cândia — só falo de Direito, advocacia e estratégia para advogados. Esse assunto não é comigo! 😄 Posso te ajudar com alguma tese, conteúdo ou estratégia jurídica?"

NUNCA tente responder perguntas fora do escopo jurídico/advocacia, nem "só desta vez".

📚 BASE DE CONHECIMENTO:
- +300 teses jurídicas escaláveis (Família, Previdenciário, Trabalhista, Cível, Criminal, Tributário, Empresarial)
- O Método Capi Cândia (6 pilares completos)
- Os 15 Passos do Atendimento Poderoso
- Scripts de WhatsApp, Meta Ads e Google Ads
- FAQ dos alunos da Comunidade
- Histórias reais do Rafael: TDAH, FIES, venda de celular, brigadeiro, carreta da justiça
- Código de Ética da OAB

🎙️ PERSONALIDADE E TOM DE VOZ:

MODO PAPICRÍTCO™ (conversas estratégicas, dúvidas gerais, motivação, orientação de carreira):
- Fala como Rafael Cândia falaria — humano, direto, com calor humano e humor
- Usa: "papi", "meu patrão", "capivarístico", "AUUUU!" (máximo 1x por conversa)
- PapiCrítico™: puxa a orelha com humor quando o aluno está procrastinando ou se vitimizando
- Se adapta ao nível de experiência do usuário (iniciante/intermediário/avançado)
- Máximo 4-5 parágrafos por resposta. Termine SEMPRE com uma pergunta de acompanhamento.
- Usa emojis com moderação e propósito

MODO TÉCNICO-PROFISSIONAL (outputs técnicos: petições, cláusulas contratuais, fundamentos jurídicos com artigos de lei, teses para copiar e usar):
- Tom sóbrio, preciso e formal — sem expressões capivarísticas
- Linguagem jurídica adequada, clara e objetiva
- Citação correta de artigos de lei, súmulas e jurisprudências
- Sem emojis no corpo do documento técnico (pode usar apenas nos títulos de seção)
- Estrutura com numeração, parágrafos e formatação profissional
- Ao FINALIZAR o output técnico, pode voltar ao tom papi para encerrar: ex. "Tá aí, papi! Só revisar os dados do caso antes de protocolar. 💪"

COMO IDENTIFICAR O MODO CORRETO:
- Pediu petição, recurso, contestação, cláusula, fundamentos jurídicos, artigos de lei → MODO TÉCNICO
- Pediu tese para copiar e protocolar → MODO TÉCNICO
- Pediu estratégia, conteúdo para redes, dica de atendimento, motivação, orientação → MODO PAPICRÍTCO™
- Pergunta geral sobre direito ou advocacia → MODO PAPICRÍTCO™ (com precisão técnica quando necessário)

📌 FRASES-CHAVE DO RAFAEL (usar apenas no MODO PAPICRÍTCO™):
- "AUUUU! Isso aqui é papo reto de capivara raiz."
- "Você não é preguiçoso não, né papi? Então por que você ainda não fez isso?"
- "Vergonha não paga boleto."
- "Não se posicionar é ser invisível. E advogado invisível não fatura."
- "Vai reclamar ou vai virar referência na sua cidade?"
- "Capivara que anda em bando não vira comida de onça."
- "Isso não é desculpa, é sabotagem disfarçada de motivo."

🧠 O MÉTODO CAPI CÂNDIA (6 PILARES):
1. Advocacia Raiz — Postura tradicional, autoridade local, indicações e reputação sólida
2. Sites de Prospecção — JusBrasil, Jusfy, GetNinjas, Elevia (filtragem, conversa e fechamento)
3. Marketing Jurídico — Conteúdo estratégico, storytelling, vencer a vergonha, gerar autoridade
4. Tráfego Pago — Meta Ads e Google Ads para escalar com responsabilidade
5. Atendimento e Precificação — Os 15 passos do atendimento poderoso
6. Inteligência Emocional e Posicionamento — Consistência, gestão emocional, rotina capivarística

⚖️ OS 15 PASSOS DO ATENDIMENTO PODEROSO:
1. Avaliação prévia do cliente (condição financeira, origem)
2. Presencial ou videochamada
3. Apresentação e quebra-gelo
4. Seja um camaleão (adapte-se ao cliente)
5. Deixe o cliente falar
6. Não interrompa o cliente
7. Tenha empatia após o cliente terminar
8. Faça perguntas pontuais
9. Apresente a solução
10. Deixe o cliente tirar dúvidas
11. TPP — Tensão Pré-Preço
12. Precificação (NUNCA passe orçamento por WhatsApp)
13. Como precificar (tabela OAB + condição do cliente)
14. Formas de pagamento flexíveis
15. Fechamento

🧩 FORMATO DAS TESES (quando solicitado):
📚 Categoria: [Área do Direito]\n🏷️ Subcategoria: [Tema específico]\n⚖️ Tese Jurídica: [Título da tese]\n👥 Público-alvo: [Perfil do cliente]\n🎯 Ideia de Reels/Carrossel: [Ideia de conteúdo EDUCATIVO — sem captação direta]\n📝 Legenda educativa: [Texto informativo, sem prometer resultados ou captar clientela]\n#️⃣ Hashtags: [5-8 hashtags relevantes]\n💬 Script de atendimento: [Para quem JÁ entrou em contato — publicidade PASSIVA permitida]\n🏷️ Tags: [Área | Tema | Complexidade: Alta/Média/Baixa]\n🔄 Status: [Testada ✅ / Em teste 🔬 / Nova 🆕]\n\n⚠️ ÉTICA OAB: Todo conteúdo gerado segue o Provimento 205/2021 e o Código de Ética. É PROIBIDO: copy de captação, Google Ads com keywords de captação, abordagem ativa de leads frios, promessa de resultados.

⚠️ LIMITES ÉTICOS:
- NUNCA prometer resultados financeiros ou percentuais de chance de ganho
- NUNCA sugerir práticas que violem o Código de Ética da OAB
- NUNCA inventar teses, jurisprudências ou materiais que não estejam na base
- NUNCA divulgar dados pessoais de outros alunos
- NUNCA fazer publicidade direta proibida pela OAB

🚨 REGRA DE HONESTIDADE (anti-alucinação):
Se não tiver o material específico na base de conhecimento, diga SEMPRE:
"Ainda não tenho esse material aqui, papi — o Rafael pode adicionar. Mas posso te ajudar com o que tenho!"
NUNCA invente teses ou cite jurisprudências que não existam.

Seu lema: "Capivara que anda em bando não vira comida de onça."`;
      db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('system_prompt', ?)").run(SEED_PROMPT);
      console.log('✅ System prompt completo restaurado via seed');
    }
    // Garante notificação de boas-vindas
    const notif = db.prepare("SELECT id FROM notifications WHERE active = 1").get();
    if (!notif) {
      db.prepare("INSERT INTO notifications (title, body, active) VALUES (?, ?, 1)")
        .run('👋 Bem-vindo ao Capi Când-IA Pro!', 'Seu assistente jurídico com IA está pronto. Use os botões no topo para Teses, Conteúdo, Petição e o Jogo!');
      console.log('✅ Notificação de boas-vindas criada via seed');
    }
  } catch(e) {
    console.error('⚠️ Erro no seed automático:', e.message);
  }
})();

// ─── DAILY BACKUP ──────────────────────────────────────────────
const BACKUP_DIR = path.join(path.dirname(DB_PATH), 'backups');
try { fs.mkdirSync(BACKUP_DIR, { recursive: true }); } catch(e) {}

async function performBackup() {
  try {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const backupPath = path.join(BACKUP_DIR, `capi-backup-${timestamp}.db`);
    await db.backup(backupPath);
    console.log(`✅ Backup criado: ${backupPath}`);
    const files = fs.readdirSync(BACKUP_DIR)
      .filter(f => f.startsWith('capi-backup-') && f.endsWith('.db'))
      .sort()
      .reverse();
    for (let i = 7; i < files.length; i++) {
      fs.unlinkSync(path.join(BACKUP_DIR, files[i]));
      console.log(`🗑️ Backup antigo removido: ${files[i]}`);
    }
  } catch(e) {
    console.error('⚠️ Erro no backup:', e.message);
  }
}

setInterval(performBackup, 24 * 60 * 60 * 1000);
setTimeout(performBackup, 30 * 1000);

// ─── RESPONSE CACHE (REMOVED — data privacy risk) ──────────────────

// ─── CORS (hardened) ────────────────────────────────────────────
app.use(cors({
  origin: function(origin, callback) {
    const allowed = ['https://capicand-ia.com', 'https://www.capicand-ia.com'];
    if (!origin || allowed.includes(origin)) {
      callback(null, true);
    } else {
      console.log(`⚠️ CORS request from unexpected origin: ${origin}`);
      callback(new Error('Origin not allowed by CORS'), false);
    }
  },
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
  allowedHeaders: ['Content-Type', 'Authorization', 'x-admin-password'],
  credentials: true
}));

app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));
// NOTA: express.static movido para após as rotas de API (ver final do arquivo)

// ─── FORÇA HTTPS ─────────────────────────────────────────────
app.set('trust proxy', 1);
app.use((req, res, next) => {
  const proto = req.headers['x-forwarded-proto'];
  if (proto && proto !== 'https') {
    return res.redirect(301, 'https://' + req.headers.host + req.originalUrl);
  }
  next();
});

// ─── SECURITY HEADERS ───────────────────────────────────────────
app.use((req, res, next) => {
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(self), geolocation=()');
  res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval' https://cdn.jsdelivr.net; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data: blob: https:; connect-src 'self' https://api.openai.com https://generativelanguage.googleapis.com https://api.elevenlabs.io; media-src 'self' blob:;");
  next();
});

// ─── API RATE LIMITER (200 req/min per user) ────────────────────
app.use('/api', apiRateLimiter);

// ─── HEALTH CHECK (public, no auth) ────────────────────────────
app.get('/api/health', (req, res) => {
  try {
    db.prepare('SELECT 1').get();
    res.json({
      status: 'ok',
      uptime: process.uptime()
    });
  } catch(e) {
    console.error('Health check error:', e);
    res.status(503).json({ status: 'error' });
  }
});

// ─── MIDDLEWARE ───────────────────────────────────────────────
function authMiddleware(req, res, next) {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'Token não fornecido' });
  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ error: 'Token inválido ou expirado' });
  }
}

const adminAttempts = new Map();
function adminMiddleware(req, res, next) {
  const ip = getClientIp(req);
  const now = Date.now();
  const record = adminAttempts.get(ip);
  if (record && record.blockedUntil && now < record.blockedUntil) {
    return res.status(429).json({ error: 'Muitas tentativas. Tente novamente mais tarde.' });
  }
  const adminPass = req.headers['x-admin-password'];
  if (!adminPass || !require('crypto').timingSafeEqual(Buffer.from(adminPass), Buffer.from(ADMIN_PASSWORD))) {
    const rec = adminAttempts.get(ip) || { count: 0, firstAttempt: now };
    if (now - rec.firstAttempt > 15 * 60 * 1000) { rec.count = 0; rec.firstAttempt = now; }
    rec.count++;
    if (rec.count >= 5) { rec.blockedUntil = now + 15 * 60 * 1000; }
    adminAttempts.set(ip, rec);
    return res.status(403).json({ error: 'Acesso negado' });
  }
  adminAttempts.delete(ip);
  next();
}

// ─── RAG: FUNÇÕES AUXILIARES ──────────────────────────────────

// Divide texto em chunks de ~800 tokens (~3200 chars) com overlap de 200 chars
function splitIntoChunks(text, chunkSize = 3200, overlap = 300) {
  const chunks = [];
  let start = 0;
  const cleanText = text.replace(/\s+/g, ' ').trim();
  
  while (start < cleanText.length) {
    let end = start + chunkSize;
    if (end < cleanText.length) {
      // Tenta quebrar em ponto, newline ou espaço
      const breakAt = cleanText.lastIndexOf('. ', end) || cleanText.lastIndexOf('\n', end) || cleanText.lastIndexOf(' ', end);
      if (breakAt > start + chunkSize * 0.5) end = breakAt + 1;
    }
    const chunk = cleanText.slice(start, end).trim();
    if (chunk.length > 50) chunks.push(chunk);
    start = end - overlap;
    if (start < 0) start = 0;
  }
  return chunks;
}

// Extrai texto de arquivos
async function extractText(filePath, originalName) {
  const ext = path.extname(originalName).toLowerCase();
  
  if (ext === '.txt' || ext === '.md') {
    return fs.readFileSync(filePath, 'utf8');
  }
  
  if (ext === '.pdf') {
    try {
      const { PDFParse } = require('pdf-parse');
      const buffer = fs.readFileSync(filePath);
      const parser = new PDFParse(new Uint8Array(buffer));
      const data = await parser.getText();
      const text = (data.text || '').trim();
      if (text.length > 50) return text;
      throw new Error('Texto vazio');
    } catch (e) {
      console.error('Erro ao parsear PDF:', e.message);
      // Fallback: tenta ler como buffer e extrair texto bruto
      try {
        const raw = fs.readFileSync(filePath, 'latin1');
        const extracted = raw.match(/[\x20-\x7E\xC0-\xFF\n\r\t]{4,}/g);
        return extracted ? extracted.join(' ').substring(0, 500000) : '';
      } catch { return ''; }
    }
  }
  
  // .docx — usa mammoth para extração correta
  if (ext === '.docx') {
    try {
      const mammoth = require('mammoth');
      const result = await mammoth.extractRawText({ path: filePath });
      return result.value || '';
    } catch (e) {
      console.error('Erro ao parsear DOCX:', e.message);
      return '';
    }
  }
  
  return '';
}

// Gera embedding via OpenAI
async function getEmbedding(text, userId = null, feature = 'embedding') {
  const response = await fetch('https://api.openai.com/v1/embeddings', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${OPENAI_API_KEY}`
    },
    body: JSON.stringify({
      model: 'text-embedding-3-small',
      input: text.slice(0, 8000) // máx 8k chars por chunk
    })
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error?.message || 'Erro ao gerar embedding');
  try {
    const embInTok = data.usage?.prompt_tokens || data.usage?.total_tokens || 0;
    const embCost = (embInTok / 1e6) * 0.02;
    if (typeof logAiUsage === 'function') logAiUsage(userId, feature, 'text-embedding-3-small', embInTok, 0, 0, embCost);
  } catch(e) {}
  return data.data[0].embedding;
}

// Similaridade por cosseno
function cosineSimilarity(a, b) {
  let dot = 0, normA = 0, normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

// Busca os chunks mais relevantes para uma query
async function searchKnowledge(query, topK = 8, userId = null) {
  const chunks = db.prepare('SELECT kc.id, kc.content, kc.embedding, kf.original_name FROM knowledge_chunks kc JOIN knowledge_files kf ON kf.id = kc.file_id WHERE kf.status = ? AND kc.embedding IS NOT NULL').all('ready');
  
  if (chunks.length === 0) return [];
  
  try {
    const queryEmbedding = await getEmbedding(query, userId, 'embedding_search');
    
    const scored = chunks.map(chunk => {
      const emb = JSON.parse(chunk.embedding);
      const score = cosineSimilarity(queryEmbedding, emb);
      return { ...chunk, score };
    });
    
    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, topK).filter(c => c.score > 0.2);
  } catch (e) {
    console.error('Erro na busca semântica:', e.message);
    return [];
  }
}

// Processa arquivo em background (gera embeddings)
async function processFile(fileId) {
  const file = db.prepare('SELECT * FROM knowledge_files WHERE id = ?').get(fileId);
  if (!file) return;
  
  try {
    const text = await extractText(file.file_path, file.original_name);
    if (!text || text.length < 10) {
      db.prepare("UPDATE knowledge_files SET status = 'error' WHERE id = ?").run(fileId);
      return;
    }
    
    const chunks = splitIntoChunks(text);
    console.log(`📚 Processando ${file.original_name}: ${chunks.length} chunks`);
    
    // Insere chunks
    const insertChunk = db.prepare('INSERT INTO knowledge_chunks (file_id, chunk_index, content) VALUES (?, ?, ?)');
    for (let i = 0; i < chunks.length; i++) {
      insertChunk.run(fileId, i, chunks[i]);
    }
    
    // Gera embeddings em lotes de 5 para não throttlar a API
    const allChunks = db.prepare('SELECT id, content FROM knowledge_chunks WHERE file_id = ?').all(fileId);
    let processed = 0;
    
    for (let i = 0; i < allChunks.length; i += 5) {
      const batch = allChunks.slice(i, i + 5);
      await Promise.all(batch.map(async (chunk) => {
        try {
          const emb = await getEmbedding(chunk.content, 0, 'embedding_ingest');
          db.prepare('UPDATE knowledge_chunks SET embedding = ? WHERE id = ?').run(JSON.stringify(emb), chunk.id);
          processed++;
        } catch (e) {
          console.error(`Erro no embedding chunk ${chunk.id}:`, e.message);
        }
      }));
      // Pequena pausa para respeitar rate limit
      if (i + 5 < allChunks.length) await new Promise(r => setTimeout(r, 200));
    }
    
    db.prepare("UPDATE knowledge_files SET status = 'ready', chunk_count = ? WHERE id = ?").run(processed, fileId);
    console.log(`✅ ${file.original_name} pronto — ${processed} embeddings gerados`);
    
  } catch (e) {
    console.error(`Erro ao processar arquivo ${fileId}:`, e.message);
    db.prepare("UPDATE knowledge_files SET status = 'error' WHERE id = ?").run(fileId);
  }
}

// ─── ONLINE TRACKING (in-memory) ──────────────────────────────
const _onlineUsers = new Map(); // userId -> { name, email, lastSeen }
const ONLINE_TIMEOUT = 2 * 60 * 1000; // 2 minutos sem heartbeat = offline

app.post('/api/heartbeat', authMiddleware, (req, res) => {
  const userId = req.user.id;
  const user = db.prepare('SELECT name, email FROM users WHERE id = ?').get(userId);
  _onlineUsers.set(userId, {
    name: user?.name || '',
    email: user?.email || '',
    lastSeen: Date.now()
  });
  // Atualiza last_login
  db.prepare("UPDATE users SET last_login = datetime('now') WHERE id = ?").run(userId);
  res.json({ ok: true });
});

app.get('/api/admin/online', adminMiddleware, (req, res) => {
  const now = Date.now();
  const online = [];
  for (const [uid, data] of _onlineUsers) {
    if (now - data.lastSeen < ONLINE_TIMEOUT) {
      online.push({ id: uid, name: data.name, email: data.email, lastSeen: new Date(data.lastSeen).toISOString() });
    } else {
      _onlineUsers.delete(uid);
    }
  }
  res.json({ count: online.length, users: online });
});

// ─── AUTH ─────────────────────────────────────────────────────
app.post('/api/register', loginRateLimiter, async (req, res) => {
  const { name, email, password, accepted_terms } = req.body;
  if (!name || !email || !password) return res.status(400).json({ error: 'Preencha todos os campos' });
  if (!accepted_terms) return res.status(400).json({ error: 'Você deve aceitar os Termos de Uso e a Política de Privacidade' });
  if (password.length < 6) return res.status(400).json({ error: 'Senha deve ter no mínimo 6 caracteres' });
  try {
    const safeName = sanitizeInput(name);
    const hash = await bcrypt.hash(password, 10);
    const result = db.prepare('INSERT INTO users (name, email, password, accepted_terms_at) VALUES (?, ?, ?, datetime(\'now\'))').run(safeName, email.toLowerCase(), hash);
    const token = jwt.sign({ id: result.lastInsertRowid, email, name: safeName }, JWT_SECRET, { expiresIn: '30d' });
    res.json({ token, user: { id: result.lastInsertRowid, name: safeName, email } });
  } catch (e) {
    if (e.message.includes('UNIQUE')) return res.status(400).json({ error: 'Email já cadastrado' });
    res.status(500).json({ error: 'Erro ao criar conta' });
  }
});

app.post('/api/login', loginRateLimiter, async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'Preencha todos os campos' });
  const ip = getClientIp(req);
  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email.toLowerCase());
  if (!user) {
    recordFailedLogin(ip, email);
    return res.status(401).json({ error: 'Email ou senha incorretos' });
  }
  if (!user.active) return res.status(403).json({ error: 'Conta desativada. Entre em contato com o suporte.' });
  const valid = await bcrypt.compare(password, user.password);
  if (!valid) {
    recordFailedLogin(ip, email);
    return res.status(401).json({ error: 'Email ou senha incorretos' });
  }
  clearLoginAttempts(ip, email);
  db.prepare("UPDATE users SET last_login = datetime('now') WHERE id = ?").run(user.id);
  const token = jwt.sign({ id: user.id, email: user.email, name: user.name }, JWT_SECRET, { expiresIn: '30d' });
  res.json({ token, user: { id: user.id, name: user.name, email: user.email } });
});

// ─── FORGOT / RESET PASSWORD (tokens salvos no banco, não na RAM) ──────────
// Cria tabela de reset tokens se não existir
db.prepare(`
  CREATE TABLE IF NOT EXISTS reset_tokens (
    token TEXT PRIMARY KEY,
    email TEXT NOT NULL,
    expires_at INTEGER NOT NULL,
    created_at TEXT DEFAULT (datetime('now'))
  )
`).run();

// Limpa tokens expirados periodicamente
setInterval(() => {
  db.prepare('DELETE FROM reset_tokens WHERE expires_at < ?').run(Date.now());
}, 60 * 60 * 1000);

// Coluna para 2o email de reativação (10 dias)
try { db.prepare('ALTER TABLE users ADD COLUMN reativacao_2_enviada TEXT').run(); } catch(e) {}

const REATIVACAO_NIVEIS = [
  { nivel: 1, nome: 'CapiBaby' }, { nivel: 2, nome: 'CapiAprendiz' },
  { nivel: 3, nome: 'CapiAdvogado' }, { nivel: 4, nome: 'CapiEstrategista' },
  { nivel: 5, nome: 'CapiMestre' }, { nivel: 6, nome: 'CapiLenda' },
  { nivel: 7, nome: 'CapiSupremo' }
];

// Email de reativação — usuários pagos inativos há 7 dias (personalizado)
setInterval(async () => {
  try {
    const sete_dias_atras = new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString();
    const inativos = db.prepare(`
      SELECT id, name, email FROM users
      WHERE plan = 'paid'
      AND active = 1
      AND (last_login IS NULL OR last_login < ?)
      AND (reativacao_enviada IS NULL OR reativacao_enviada < ?)
    `).all(sete_dias_atras, sete_dias_atras);

    for (const user of inativos) {
      const nome = user.name ? user.name.split(' ')[0] : 'Advogado';
      let progress = null;
      try {
        progress = db.prepare(`
          SELECT xp_total, nivel, streak_atual, streak_max, liga_xp_semana,
            (SELECT COUNT(*) FROM messages WHERE user_id = u.id AND role = 'user') as total_msgs,
            (SELECT COUNT(*) FROM conversations WHERE user_id = u.id) as total_convs
          FROM users u WHERE u.id = ?
        `).get(user.id);
      } catch(e) {}
      const nivelInfo = REATIVACAO_NIVEIS.find(n => n.nivel === (progress?.nivel || 1)) || REATIVACAO_NIVEIS[0];
      const xp = progress?.xp_total || 0;
      const totalMsgs = progress?.total_msgs || 0;
      const streakMax = progress?.streak_max || 0;
      const streakText = streakMax > 0
        ? `Seu recorde de sequ\u00eancia era <strong>${streakMax} dias</strong>. Bora bater esse recorde?`
        : 'Que tal come\u00e7ar uma sequ\u00eancia de treinos di\u00e1rios?';

      const html = `
        <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;background:#0a0a0a;color:#e8f5e9;padding:40px 32px;border-radius:12px">
          <h2 style="color:#b8860b;text-align:center">Oi, ${nome}! A Capi sentiu sua falta. \uD83D\uDC4B</h2>
          <p style="color:#ccc;font-size:15px;line-height:1.6">Voc\u00ea j\u00e1 trocou <strong style="color:#00e676">${totalMsgs} mensagens</strong> comigo e tem <strong style="color:#ffd740">${xp} XP</strong> acumulados.</p>
          <p style="color:#ccc;font-size:15px;line-height:1.6">Seu n\u00edvel atual: <strong style="color:#b8860b">${nivelInfo.nome}</strong> (N\u00edvel ${progress?.nivel || 1})</p>
          <p style="color:#ccc;font-size:15px;line-height:1.6">${streakText}</p>
          <p style="color:#ffd740;font-size:15px;font-weight:bold;text-align:center;margin:20px 0">Voc\u00ea tem 3 miss\u00f5es di\u00e1rias te esperando no CapiTreino!</p>
          <div style="text-align:center;margin:28px 0;display:flex;gap:12px;justify-content:center;flex-wrap:wrap">
            <a href="https://capicand-ia.com/app" style="background:#b8860b;color:#fff;padding:14px 32px;border-radius:8px;text-decoration:none;font-weight:bold;font-size:15px">\u2696\uFE0F Voltar para a Capi</a>
            <a href="https://capicand-ia.com/capitreino.html" style="background:#DAA520;color:#000;padding:14px 32px;border-radius:8px;text-decoration:none;font-weight:bold;font-size:15px">\uD83C\uDFCB\uFE0F Ir para o CapiTreino</a>
          </div>
          <p style="font-size:12px;color:#555;text-align:center">Capi C\u00e2nd-IA Pro &mdash; Sua assistente jur\u00eddica com IA</p>
        </div>
      `;
      try {
        await sendEmail(user.email, `${nome}, a Capi sentiu sua falta! \uD83D\uDC4B`, html);
        db.prepare('UPDATE users SET reativacao_enviada = ? WHERE id = ?').run(new Date().toISOString(), user.id);
        console.log(`\u2705 Email reativacao personalizado enviado para: ${user.email}`);
      } catch(e) {
        console.error(`\u26A0\uFE0F Erro email reativacao ${user.email}:`, e.message);
      }
    }

    // 2o tier: "última chamada" após 10 dias de inatividade
    const dez_dias_atras = new Date(Date.now() - 10 * 24 * 3600 * 1000).toISOString();
    const inativos2 = db.prepare(`
      SELECT id, name, email FROM users
      WHERE plan = 'paid'
      AND active = 1
      AND (last_login IS NULL OR last_login < ?)
      AND reativacao_enviada IS NOT NULL
      AND (reativacao_2_enviada IS NULL OR reativacao_2_enviada < ?)
    `).all(dez_dias_atras, dez_dias_atras);

    for (const user of inativos2) {
      const nome = user.name ? user.name.split(' ')[0] : 'Advogado';
      const html2 = `
        <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;background:#0a0a0a;color:#e8f5e9;padding:40px 32px;border-radius:12px">
          <h2 style="color:#ef5350;text-align:center">Faz 10 dias que a gente n\u00e3o conversa...</h2>
          <p style="color:#ccc;font-size:16px;line-height:1.7;text-align:center">T\u00e1 tudo bem, ${nome}? A Capi t\u00e1 aqui prontinha.</p>
          <p style="color:#aaa;font-size:14px;line-height:1.6;text-align:center">Seus dados, miss\u00f5es e progresso continuam salvos. \u00c9 s\u00f3 voltar.</p>
          <div style="text-align:center;margin:28px 0">
            <a href="https://capicand-ia.com/app" style="background:#ef5350;color:#fff;padding:16px 40px;border-radius:8px;text-decoration:none;font-weight:bold;font-size:16px">\uD83D\uDC4B Voltar agora</a>
          </div>
          <p style="font-size:12px;color:#555;text-align:center">Capi C\u00e2nd-IA Pro &mdash; Sua assistente jur\u00eddica com IA</p>
        </div>
      `;
      try {
        await sendEmail(user.email, `${nome}, \u00faltima chamada da Capi...`, html2);
        db.prepare('UPDATE users SET reativacao_2_enviada = ? WHERE id = ?').run(new Date().toISOString(), user.id);
        console.log(`\u2705 Email reativacao 2 (10d) enviado para: ${user.email}`);
      } catch(e) {
        console.error(`\u26A0\uFE0F Erro email reativacao 2 ${user.email}:`, e.message);
      }
    }
  } catch(e) {
    console.error('\u26A0\uFE0F Erro no job de reativacao:', e.message);
  }
}, 24 * 60 * 60 * 1000); // Roda 1x por dia

// ─── CRON: AVISOS DE VENCIMENTO + RENOVAÇÃO ──────────────────────
// Adicionar coluna para rastrear avisos enviados
try { db.prepare('ALTER TABLE users ADD COLUMN renewal_reminder_7d TEXT').run(); } catch(e) {}
try { db.prepare('ALTER TABLE users ADD COLUMN renewal_reminder_3d TEXT').run(); } catch(e) {}
try { db.prepare('ALTER TABLE users ADD COLUMN renewal_reminder_0d TEXT').run(); } catch(e) {}
try { db.prepare('ALTER TABLE users ADD COLUMN renewal_reminder_expired TEXT').run(); } catch(e) {}

// Fundador mantém R$47 enquanto pagar no prazo
const CHECKOUT_MONTHLY_FUNDADOR = 'https://clkdmg.site/subscribe/mensal-capi-candia-pro'; // R$47
// Cliente novo paga R$97
const CHECKOUT_MONTHLY_NOVO = 'https://clkdmg.site/subscribe/mensal-capi-candia-pro-97';
// Anual: SEMPRE o novo R$804 (R$397 antigo foi descontinuado)
const CHECKOUT_ANNUAL_NOVO = 'https://clkdmg.site/subscribe/anual-capi-candia-pro-804';

function renewalEmailTemplate(nome, diasRestantes, tipo, isFundador) {
  const firstName = nome ? nome.split(' ')[0] : 'Advogado';
  const checkoutMonthly = isFundador ? CHECKOUT_MONTHLY_FUNDADOR : CHECKOUT_MONTHLY_NOVO;

  let titulo, subtitulo, corpo, ctaText, urgencyColor, urgencyBg;

  if (tipo === '7dias') {
    titulo = `${firstName}, sua assinatura vence em 7 dias`;
    subtitulo = 'Renove agora e continue com acesso completo';
    corpo = `<p style="color:#444;font-size:15px;line-height:1.7">Sua assinatura da <strong style="color:#8B6914">Capi Când-IA Pro</strong> vence em <strong>7 dias</strong>.</p>
    <p style="color:#444;font-size:15px;line-height:1.7">Para não perder acesso às petições, análise de documentos, teses jurídicas e todo o poder da sua IA jurídica, renove com antecedência.</p>`;
    ctaText = 'Renovar minha assinatura';
    urgencyColor = '#8B6914';
    urgencyBg = '#fdf8ee';
  } else if (tipo === '3dias') {
    titulo = `${firstName}, faltam apenas 3 dias!`;
    subtitulo = 'Sua assinatura está prestes a expirar';
    corpo = `<p style="color:#444;font-size:15px;line-height:1.7">Sua assinatura da <strong style="color:#8B6914">Capi Când-IA Pro</strong> expira em <strong>3 dias</strong>.</p>
    <p style="color:#444;font-size:15px;line-height:1.7">Não fique sem sua assistente jurídica com IA. Renove agora para continuar usando petições automáticas, análise de documentos, honorários por estado e muito mais.</p>`;
    ctaText = 'Renovar agora — não perder acesso';
    urgencyColor = '#e67e00';
    urgencyBg = '#fff8f0';
  } else if (tipo === 'hoje') {
    titulo = `${firstName}, sua assinatura vence HOJE!`;
    subtitulo = 'Último dia para renovar sem perder acesso';
    corpo = `<p style="color:#444;font-size:15px;line-height:1.7"><strong style="color:#d32f2f">Hoje é o último dia</strong> da sua assinatura da <strong style="color:#8B6914">Capi Când-IA Pro</strong>.</p>
    <p style="color:#444;font-size:15px;line-height:1.7">A partir de amanhã, você perderá acesso a:</p>
    <ul style="color:#444;font-size:15px;line-height:2">
      <li>Montagem de petições com IA</li>
      <li>Análise de documentos e contratos</li>
      <li>Consulta de honorários (tabela OAB)</li>
      <li>Geração de conteúdo para Instagram</li>
      <li>CapiTreino e todas as funcionalidades premium</li>
    </ul>
    <p style="color:#444;font-size:15px;line-height:1.7">Renove agora e continue aproveitando tudo sem interrupção.</p>`;
    ctaText = 'RENOVAR AGORA — ÚLTIMO DIA';
    urgencyColor = '#d32f2f';
    urgencyBg = '#fef2f2';
  } else if (tipo === 'expirado') {
    titulo = `${firstName}, sentimos sua falta na Capi`;
    subtitulo = 'Sua assinatura expirou — mas você pode voltar agora';
    corpo = `<p style="color:#444;font-size:15px;line-height:1.7">Sua assinatura da <strong style="color:#8B6914">Capi Când-IA Pro</strong> expirou e seu acesso foi suspenso.</p>
    <p style="color:#444;font-size:15px;line-height:1.7">Seus dados, conversas e documentos continuam salvos. Basta renovar para recuperar tudo instantaneamente.</p>
    <p style="color:#444;font-size:15px;line-height:1.7">A Capi continua evoluindo todos os dias — novas teses, funcionalidades e melhorias esperando por você.</p>`;
    ctaText = 'Reativar minha assinatura';
    urgencyColor = '#8B6914';
    urgencyBg = '#fdf8ee';
  }

  const founderAlert = isFundador ? `
      <div style="background:#fff8e1;border:1px solid #ffd54f;border-radius:8px;padding:14px;margin:16px 0">
        <strong style="color:#8B6914">⚠️ Atenção, fundador:</strong>
        <p style="color:#555;font-size:14px;margin:6px 0 0;line-height:1.6">
          Se sua assinatura expirar e você precisar voltar, <strong>o valor de fundador (R$47) não estará mais disponível</strong> —
          você terá que pagar o preço atual (R$97/mês) e sua memória das conversas será perdida.
          Renove a tempo pra manter seu desconto e histórico completo.
        </p>
      </div>` : '';

  return `
  <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;background:#faf9f7;padding:0;border-radius:12px;overflow:hidden">
    <div style="background:linear-gradient(135deg,#8B6914,#d4a017);padding:30px;text-align:center">
      <h1 style="color:#fff;font-size:24px;margin:0;font-weight:700">Capi Când-IA Pro</h1>
      <p style="color:rgba(255,255,255,0.8);font-size:13px;margin-top:4px">A IA do Advogado Brasileiro</p>
    </div>
    <div style="padding:32px">
      <div style="background:${urgencyBg};border-left:4px solid ${urgencyColor};padding:16px 20px;border-radius:0 8px 8px 0;margin-bottom:24px">
        <h2 style="color:${urgencyColor};font-size:18px;margin:0 0 4px">${titulo}</h2>
        <p style="color:#666;font-size:14px;margin:0">${subtitulo}</p>
      </div>
      ${corpo}${founderAlert}
      <div style="text-align:center;margin:32px 0">
        <a href="${checkoutMonthly}" style="background:linear-gradient(135deg,#b8860b,#d4a017);color:#fff;padding:16px 40px;border-radius:8px;text-decoration:none;font-size:16px;font-weight:bold;display:inline-block;box-shadow:0 4px 14px rgba(184,134,11,0.3)">${ctaText}</a>
      </div>
      <p style="text-align:center;color:#888;font-size:13px">Ou assine o <a href="${CHECKOUT_ANNUAL_NOVO}" style="color:#8B6914;font-weight:600">plano anual com desconto</a></p>
    </div>
    <div style="background:#f3f1ee;padding:20px;text-align:center;border-top:1px solid #e8e4de">
      <p style="color:#999;font-size:12px;margin:0">Comunidade Capi Candia — A maior IA jurídica para o advogado brasileiro</p>
      <p style="color:#bbb;font-size:11px;margin-top:8px">Se você renovou pelo cartão de crédito, ignore este email — sua cobrança é automática.</p>
    </div>
  </div>`;
}

// Roda a cada 6 horas para verificar assinaturas prestes a vencer
setInterval(async () => {
  try {
    const agora = new Date();
    const hoje = agora.toISOString().split('T')[0]; // YYYY-MM-DD
    
    // Buscar todos os usuários pagos com data de expiração
    const usuarios = db.prepare(`
      SELECT id, name, email, plan_type, plan_expires_at, is_founder,
             renewal_reminder_7d, renewal_reminder_3d, renewal_reminder_0d, renewal_reminder_expired
      FROM users
      WHERE plan_type IN ('paid', 'gift')
        AND plan_expires_at IS NOT NULL
        AND email != 'rafaelcandia.cj@gmail.com'
        AND email NOT LIKE '%teste%'
    `).all();

    for (const user of usuarios) {
      const nome = user.name || 'Advogado';
      const expDate = new Date(user.plan_expires_at);
      const diffMs = expDate.getTime() - agora.getTime();
      const diffDias = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
      const isFundador = !!user.is_founder;

      try {
        // 7 dias antes
        if (diffDias === 7 && user.renewal_reminder_7d !== hoje) {
          await sendEmail(user.email, `${nome.split(' ')[0]}, sua assinatura vence em 7 dias`, renewalEmailTemplate(nome, 7, '7dias', isFundador));
          db.prepare('UPDATE users SET renewal_reminder_7d = ? WHERE id = ?').run(hoje, user.id);
          console.log(`📧 Aviso 7 dias enviado para: ${user.email} (fundador: ${isFundador})`);
        }
        // 3 dias antes
        else if (diffDias === 3 && user.renewal_reminder_3d !== hoje) {
          await sendEmail(user.email, `${nome.split(' ')[0]}, faltam 3 dias para sua assinatura expirar!`, renewalEmailTemplate(nome, 3, '3dias', isFundador));
          db.prepare('UPDATE users SET renewal_reminder_3d = ? WHERE id = ?').run(hoje, user.id);
          console.log(`📧 Aviso 3 dias enviado para: ${user.email} (fundador: ${isFundador})`);
        }
        // No dia do vencimento
        else if (diffDias === 0 && user.renewal_reminder_0d !== hoje) {
          await sendEmail(user.email, `${nome.split(' ')[0]}, sua assinatura vence HOJE!`, renewalEmailTemplate(nome, 0, 'hoje', isFundador));
          db.prepare('UPDATE users SET renewal_reminder_0d = ? WHERE id = ?').run(hoje, user.id);
          console.log(`📧 Aviso dia do vencimento enviado para: ${user.email} (fundador: ${isFundador})`);
        }
        // 1 dia após expiração
        else if (diffDias === -1 && user.renewal_reminder_expired !== hoje) {
          await sendEmail(user.email, `${nome.split(' ')[0]}, sua assinatura expirou — reative agora`, renewalEmailTemplate(nome, -1, 'expirado', isFundador));
          db.prepare('UPDATE users SET renewal_reminder_expired = ? WHERE id = ?').run(hoje, user.id);
          console.log(`📧 Aviso expiração enviado para: ${user.email} (fundador: ${isFundador})`);
          // Notificar o Rafael também
          await sendEmail('rafaelcandia.cj@gmail.com', `⚠️ Assinatura expirada: ${nome} (${user.email})`,
            `<div style="font-family:Arial;padding:20px"><h3 style="color:#d32f2f">Assinatura expirada</h3><p><strong>${nome}</strong> (${user.email}) teve a assinatura expirada hoje.</p><p>Tipo: ${user.plan_type} | Expirava em: ${user.plan_expires_at} | Fundador: ${isFundador ? 'Sim' : 'Não'}</p></div>`);
        }
      } catch(emailErr) {
        console.error(`⚠️ Erro ao enviar aviso renovação para ${user.email}:`, emailErr.message);
      }
    }
    
    console.log(`✅ Job renovação executado: ${usuarios.length} assinaturas verificadas`);
  } catch(e) {
    console.error('⚠️ Erro no job de renovação:', e.message);
  }
}, 6 * 60 * 60 * 1000); // Roda a cada 6 horas

// Rodar imediatamente na inicialização (após 30 segundos para dar tempo de tudo carregar)
setTimeout(async () => {
  try {
    const agora = new Date();
    const hoje = agora.toISOString().split('T')[0];
    const usuarios = db.prepare(`
      SELECT id, name, email, plan_type, plan_expires_at, is_founder,
             renewal_reminder_7d, renewal_reminder_3d, renewal_reminder_0d, renewal_reminder_expired
      FROM users
      WHERE plan_type IN ('paid', 'gift')
        AND plan_expires_at IS NOT NULL
        AND email != 'rafaelcandia.cj@gmail.com'
        AND email NOT LIKE '%teste%'
    `).all();
    let enviados = 0;
    for (const user of usuarios) {
      const nome = user.name || 'Advogado';
      const expDate = new Date(user.plan_expires_at);
      const diffMs = expDate.getTime() - agora.getTime();
      const diffDias = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
      const isFundador = !!user.is_founder;
      try {
        if (diffDias === 7 && user.renewal_reminder_7d !== hoje) {
          await sendEmail(user.email, `${nome.split(' ')[0]}, sua assinatura vence em 7 dias`, renewalEmailTemplate(nome, 7, '7dias', isFundador));
          db.prepare('UPDATE users SET renewal_reminder_7d = ? WHERE id = ?').run(hoje, user.id);
          enviados++;
        } else if (diffDias === 3 && user.renewal_reminder_3d !== hoje) {
          await sendEmail(user.email, `${nome.split(' ')[0]}, faltam 3 dias para sua assinatura expirar!`, renewalEmailTemplate(nome, 3, '3dias', isFundador));
          db.prepare('UPDATE users SET renewal_reminder_3d = ? WHERE id = ?').run(hoje, user.id);
          enviados++;
        } else if (diffDias === 0 && user.renewal_reminder_0d !== hoje) {
          await sendEmail(user.email, `${nome.split(' ')[0]}, sua assinatura vence HOJE!`, renewalEmailTemplate(nome, 0, 'hoje', isFundador));
          db.prepare('UPDATE users SET renewal_reminder_0d = ? WHERE id = ?').run(hoje, user.id);
          enviados++;
        } else if (diffDias <= -1 && diffDias >= -3 && user.renewal_reminder_expired !== hoje) {
          await sendEmail(user.email, `${nome.split(' ')[0]}, sua assinatura expirou — reative agora`, renewalEmailTemplate(nome, -1, 'expirado', isFundador));
          db.prepare('UPDATE users SET renewal_reminder_expired = ? WHERE id = ?').run(hoje, user.id);
          enviados++;
        }
      } catch(e) { console.error(`⚠️ Erro aviso ${user.email}:`, e.message); }
    }
    console.log(`✅ Job renovação inicial: ${enviados} emails enviados de ${usuarios.length} assinaturas`);
  } catch(e) { console.error('⚠️ Erro job renovação inicial:', e.message); }
}, 30000);

// ─── CRON: REMOVER STATUS FUNDADOR APÓS 3 DIAS DE ATRASO ─────
// Roda 1x por dia (junto com o ciclo de 24h). Fundador que não renovou
// em até 3 dias depois de plan_expires_at perde is_founder.
setInterval(() => {
  try {
    const result = db.prepare(`
      UPDATE users
      SET is_founder = 0
      WHERE is_founder = 1
        AND plan_expires_at < datetime('now', '-3 days')
    `).run();
    if (result.changes > 0) {
      console.log(`🚫 Fundador expirado: ${result.changes} user(s) perderam status de fundador (3+ dias sem renovar)`);
    }
  } catch(e) {
    console.error('⚠️ Erro no job de expiração fundador:', e.message);
  }
}, 24 * 60 * 60 * 1000); // Roda 1x por dia

// Rodar expiração de fundador também no startup (após 35s)
setTimeout(() => {
  try {
    const result = db.prepare(`
      UPDATE users
      SET is_founder = 0
      WHERE is_founder = 1
        AND plan_expires_at < datetime('now', '-3 days')
    `).run();
    if (result.changes > 0) {
      console.log(`🚫 Startup: ${result.changes} fundador(es) perderam status (3+ dias sem renovar)`);
    }
  } catch(e) {
    console.error('⚠️ Erro expiração fundador startup:', e.message);
  }
}, 35000);

// ─── CRON: RECONCILE DUPLICATAS MENSAL+ANUAL (4h UTC = 1h BRT) ─────
// Roda 1x por dia. Detecta users pro com mensal ativa e cancela/estorna.
setInterval(async () => {
  const now = new Date();
  // Só roda se estiver entre 4:00 e 4:59 UTC (evita rodar várias vezes)
  if (now.getUTCHours() === 4) {
    try {
      await reconcileDuplicateSubscriptions();
    } catch (e) {
      console.error('[reconcile-cron] Error:', e.message);
    }
  }
}, 60 * 60 * 1000); // Checa a cada hora, mas só executa às 4h UTC

// Rodar reconcile também no startup (após 60s) para pegar pendentes imediatos
setTimeout(async () => {
  try {
    const pending = db.prepare(`SELECT COUNT(*) as cnt FROM users WHERE upgrade_cancel_pending = 1`).get();
    if (pending && pending.cnt > 0) {
      console.log(`[reconcile-startup] ${pending.cnt} user(s) with pending cancel — running reconcile now`);
      await reconcileDuplicateSubscriptions();
    }
  } catch (e) {
    console.error('[reconcile-startup] Error:', e.message);
  }
}, 60000);

app.post('/api/auth/forgot-password', loginRateLimiter, async (req, res) => {
  const { email } = req.body;
  if (!email) return res.status(400).json({ error: 'Email obrigatório' });
  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email.toLowerCase());
  if (!user) return res.json({ ok: true }); // não revela se email existe

  const token = require('crypto').randomBytes(32).toString('hex');
  const expiresAt = Date.now() + 24 * 3600000; // 24 horas

  // Salva no banco (persiste entre reinicializações)
  db.prepare('INSERT OR REPLACE INTO reset_tokens (token, email, expires_at) VALUES (?, ?, ?)').run(token, email.toLowerCase(), expiresAt);

  const BASE_URL = 'https://capicand-ia.com';
  const resetLink = `${BASE_URL}/app?reset=${token}`;

  // Responde imediatamente, envia email em background
  res.json({ ok: true });

  setImmediate(async () => {
    try {
      const html = `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;background:#0a0a0a;color:#e8f5e9;padding:40px 32px;border-radius:12px"><h2 style="color:#ffd700;text-align:center">Capi Când-IA Pro</h2><p style="color:#ccc">Clique no botão abaixo para criar ou redefinir sua senha. Link válido por <strong>24 horas</strong>.</p><div style="text-align:center;margin:32px 0"><a href="${resetLink}" style="background:#ffd700;color:#000;padding:16px 40px;border-radius:8px;text-decoration:none;font-weight:bold;font-size:16px">🔐 Criar minha senha</a></div><p style="font-size:12px;color:#555">Ou copie: ${resetLink}</p></div>`;
      await sendEmail(email, 'Crie sua senha — Capi Când-IA Pro', html);
      console.log('✅ Email reset enviado para:', email);
    } catch(e) { console.error('⚠️ Erro email reset:', e.message); }
  });
});

app.post('/api/auth/reset-password', loginRateLimiter, async (req, res) => {
  const { token, password } = req.body;
  if (!token || !password) return res.status(400).json({ error: 'Dados inválidos' });
  if (password.length < 6) return res.status(400).json({ error: 'Senha deve ter no mínimo 6 caracteres' });
  // Busca token no banco (não na RAM)
  const data = db.prepare('SELECT * FROM reset_tokens WHERE token = ?').get(token);
  if (!data || data.expires_at < Date.now()) return res.status(400).json({ error: 'Link expirado ou inválido. Solicite um novo.' });
  const hash = await bcrypt.hash(password, 10);
  db.prepare('UPDATE users SET password = ? WHERE email = ?').run(hash, data.email);
  db.prepare('DELETE FROM reset_tokens WHERE token = ?').run(token);
  console.log('✅ Senha definida para:', data.email);
  res.json({ ok: true });
});

// ─── CONVERSAS ────────────────────────────────────────────────
app.get('/api/conversations', authMiddleware, (req, res) => {
  // Se ?all=1, retorna todas; senão só as soltas (sem projeto)
  const includeAll = req.query.all === '1';
  const convs = db.prepare(`
    SELECT c.id, c.title, c.created_at, c.updated_at, c.project_id,
           COUNT(m.id) as message_count
    FROM conversations c
    LEFT JOIN messages m ON m.conversation_id = c.id
    WHERE c.user_id = ? ${includeAll ? '' : 'AND (c.project_id IS NULL OR c.project_id = 0)'}
    GROUP BY c.id
    ORDER BY c.updated_at DESC
    LIMIT 50
  `).all(req.user.id);
  res.json(convs);
});

app.post('/api/conversations', authMiddleware, (req, res) => {
  const { title } = req.body;
  const safeTitle = title ? sanitizeInput(title) : 'Nova conversa';
  const result = db.prepare('INSERT INTO conversations (user_id, title) VALUES (?, ?)').run(req.user.id, safeTitle);
  res.json({ id: result.lastInsertRowid, title: safeTitle });
});

app.get('/api/conversations/:id/messages', authMiddleware, (req, res) => {
  const conv = db.prepare('SELECT * FROM conversations WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
  if (!conv) return res.status(404).json({ error: 'Conversa não encontrada' });
  const messages = db.prepare('SELECT role, content, created_at FROM messages WHERE conversation_id = ? ORDER BY id ASC').all(req.params.id);
  res.json({ conversation: conv, messages });
});

app.delete('/api/conversations/:id', authMiddleware, (req, res) => {
  const conv = db.prepare('SELECT * FROM conversations WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
  if (!conv) return res.status(404).json({ error: 'Conversa não encontrada' });
  db.prepare('DELETE FROM messages WHERE conversation_id = ?').run(req.params.id);
  db.prepare('DELETE FROM conversations WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

app.patch('/api/conversations/:id/title', authMiddleware, (req, res) => {
  const { title } = req.body;
  if (!title || !title.trim()) return res.status(400).json({ error: 'Título inválido' });
  const conv = db.prepare('SELECT * FROM conversations WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
  if (!conv) return res.status(404).json({ error: 'Conversa não encontrada' });
  const safeTitle = sanitizeInput(title).substring(0, 80);
  db.prepare('UPDATE conversations SET title = ? WHERE id = ?').run(safeTitle, req.params.id);
  res.json({ success: true, title: safeTitle });
});

// ─── PROJETOS ─────────────────────────────────────────────────
app.get('/api/projects', authMiddleware, (req, res) => {
  const projects = db.prepare(`
    SELECT p.*, 
           (SELECT COUNT(*) FROM conversations c WHERE c.project_id = p.id AND c.user_id = ?) as conv_count
    FROM projects p 
    WHERE p.user_id = ? 
    ORDER BY p.updated_at DESC
  `).all(req.user.id, req.user.id);
  res.json(projects);
});

app.post('/api/projects', authMiddleware, (req, res) => {
  const { name, description, icon, context_note } = req.body;
  if (!name || !name.trim()) return res.status(400).json({ error: 'Nome do projeto é obrigatório' });
  const safeName = sanitizeInput(name);
  const safeDesc = description ? sanitizeInput(description) : '';
  const safeNote = context_note ? sanitizeInput(context_note) : '';
  const result = db.prepare(
    'INSERT INTO projects (user_id, name, description, icon, context_note) VALUES (?, ?, ?, ?, ?)'
  ).run(req.user.id, safeName, safeDesc, icon || '📁', safeNote);
  res.json({ id: result.lastInsertRowid, name: safeName, description: safeDesc, icon: icon || '📁', context_note: safeNote });
});

app.patch('/api/projects/:id', authMiddleware, (req, res) => {
  const project = db.prepare('SELECT * FROM projects WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
  if (!project) return res.status(404).json({ error: 'Projeto não encontrado' });
  const { name, description, icon, context_note } = req.body;
  if (name !== undefined) db.prepare('UPDATE projects SET name = ? WHERE id = ?').run(sanitizeInput(name).substring(0, 80), req.params.id);
  if (description !== undefined) db.prepare('UPDATE projects SET description = ? WHERE id = ?').run(sanitizeInput(description).substring(0, 500), req.params.id);
  if (icon !== undefined) db.prepare('UPDATE projects SET icon = ? WHERE id = ?').run(icon, req.params.id);
  if (context_note !== undefined) db.prepare('UPDATE projects SET context_note = ? WHERE id = ?').run(sanitizeInput(context_note).substring(0, 2000), req.params.id);
  db.prepare("UPDATE projects SET updated_at = datetime('now') WHERE id = ?").run(req.params.id);
  res.json({ success: true });
});

app.delete('/api/projects/:id', authMiddleware, (req, res) => {
  const project = db.prepare('SELECT * FROM projects WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
  if (!project) return res.status(404).json({ error: 'Projeto não encontrado' });
  // Desvincula conversas (não apaga, só remove o vínculo)
  db.prepare('UPDATE conversations SET project_id = NULL WHERE project_id = ? AND user_id = ?').run(req.params.id, req.user.id);
  db.prepare('DELETE FROM projects WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

// Mover conversa para dentro/fora de um projeto
app.patch('/api/conversations/:id/project', authMiddleware, (req, res) => {
  const conv = db.prepare('SELECT * FROM conversations WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
  if (!conv) return res.status(404).json({ error: 'Conversa não encontrada' });
  const { project_id } = req.body;
  // project_id = null para remover do projeto
  if (project_id) {
    const project = db.prepare('SELECT * FROM projects WHERE id = ? AND user_id = ?').get(project_id, req.user.id);
    if (!project) return res.status(404).json({ error: 'Projeto não encontrado' });
  }
  db.prepare('UPDATE conversations SET project_id = ? WHERE id = ?').run(project_id || null, req.params.id);
  res.json({ success: true });
});

// Criar conversa já dentro de um projeto
app.post('/api/projects/:id/conversations', authMiddleware, (req, res) => {
  try {
    const pid = parseInt(req.params.id);
    const project = db.prepare('SELECT * FROM projects WHERE id = ? AND user_id = ?').get(pid, req.user.id);
    if (!project) return res.status(404).json({ error: 'Projeto não encontrado' });
    const { title } = req.body;
    const safeTitle = title ? sanitizeInput(title) : 'Nova conversa';
    const result = db.prepare('INSERT INTO conversations (user_id, title, project_id) VALUES (?, ?, ?)').run(req.user.id, safeTitle, pid);
    db.prepare("UPDATE projects SET updated_at = datetime('now') WHERE id = ?").run(pid);
    res.json({ id: result.lastInsertRowid, title: safeTitle, project_id: pid });
  } catch(e) {
    console.error('Erro ao criar conversa no projeto:', e);
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

// Listar conversas de um projeto
app.get('/api/projects/:id/conversations', authMiddleware, (req, res) => {
  const project = db.prepare('SELECT * FROM projects WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
  if (!project) return res.status(404).json({ error: 'Projeto não encontrado' });
  const convs = db.prepare(`
    SELECT c.id, c.title, c.created_at, c.updated_at, c.project_id,
           COUNT(m.id) as message_count
    FROM conversations c
    LEFT JOIN messages m ON m.conversation_id = c.id
    WHERE c.user_id = ? AND c.project_id = ?
    GROUP BY c.id
    ORDER BY c.updated_at DESC
  `).all(req.user.id, req.params.id);
  res.json(convs);
});

// ─── CHAT COM RAG ─────────────────────────────────────────────
app.post('/api/chat', authMiddleware, async (req, res) => {
  const { messages, conversation_id, upload_id, upload_ids, project_id } = req.body;
  if (!messages || !Array.isArray(messages)) return res.status(400).json({ error: 'Mensagens inválidas' });
  if (!OPENAI_API_KEY) return res.status(500).json({ error: 'API key não configurada' });

  const requestId = `${req.user.id}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

  const systemPrompt = db.prepare("SELECT value FROM settings WHERE key = 'system_prompt'").get()?.value || '';
  
  // Injeta memória do usuário (nome, área, cidade, estado, tom, experiência, oab, escritório)
  const userProfile = db.prepare('SELECT * FROM user_profiles WHERE user_id = ?').get(req.user.id);
  let profileCtx = '';
  const hasProfile = userProfile && userProfile.nome;

  // Carrega memórias com scoring de relevância
  const userMemories = db.prepare('SELECT id, category, insight, relevance_score, access_count FROM user_memory WHERE user_id = ? ORDER BY relevance_score DESC, updated_at DESC LIMIT 60').all(req.user.id);

  // Carrega resumos de conversas recentes (últimas 10)
  const recentSummaries = db.prepare('SELECT summary, key_topics, action_items, emotional_tone, created_at FROM conversation_summaries WHERE user_id = ? ORDER BY created_at DESC LIMIT 10').all(req.user.id);

  // Carrega casos ativos
  const activeCases = db.prepare('SELECT titulo, cliente, area, detalhes, proximo_passo, prazo, updated_at FROM user_cases WHERE user_id = ? AND status = ? ORDER BY updated_at DESC LIMIT 10').all(req.user.id, 'ativo');

  if (hasProfile) {
    // Memórias agrupadas por categoria
    let memoriesText = '';
    if (userMemories.length > 0) {
      const grouped = {};
      userMemories.forEach(m => { if (!grouped[m.category]) grouped[m.category] = []; grouped[m.category].push(m.insight); });
      memoriesText = '\n- Memórias sobre este advogado:\n' +
        Object.entries(grouped).map(([cat, items]) => `  [${cat}] ${items.slice(0,6).join(' | ')}`).join('\n');

      // Marca memórias como acessadas (boost relevance)
      const memIds = userMemories.slice(0, 40).map(m => m.id);
      if (memIds.length > 0) {
        db.prepare(`UPDATE user_memory SET access_count = access_count + 1 WHERE id IN (${memIds.join(',')})`).run();
      }
    }

    // Resumos de conversas recentes
    let summariesText = '';
    if (recentSummaries.length > 0) {
      summariesText = '\n\n📋 HISTÓRICO RECENTE DE CONVERSAS:\n' +
        recentSummaries.slice(0, 5).map((s, i) => `  ${i+1}. ${s.summary}${s.action_items ? ' [Pendente: ' + s.action_items + ']' : ''}`).join('\n');
    }

    // Casos ativos
    let casesText = '';
    if (activeCases.length > 0) {
      casesText = '\n\n📂 CASOS ATIVOS DO ADVOGADO:\n' +
        activeCases.map(c => `  • ${c.titulo}${c.cliente ? ' (Cliente: ' + c.cliente + ')' : ''}${c.area ? ' [' + c.area + ']' : ''}${c.proximo_passo ? ' → Próx: ' + c.proximo_passo : ''}${c.prazo ? ' ⏰ ' + c.prazo : ''}`).join('\n');
    }

    // Termômetro de tom
    const tom = userProfile.tom_preferido || 'equilibrado';
    let tomInstrucao = '';
    if (tom === 'descontraido') {
      tomInstrucao = '\n\n🌡️ TOM DE COMUNICAÇÃO: DESCONTRAÍDO — Use papi, AUUU!, humor capivarístico, expressões do Rafael Cândia. Seja leve, divertido e humano. Emojis liberados com propósito.';
    } else if (tom === 'formal') {
      tomInstrucao = '\n\n🌡️ TOM DE COMUNICAÇÃO: FORMAL — Tom completamente formal e técnico. Sem "papi", sem "AUUU", sem emojis, sem expressões informais. Linguagem forense e profissional em todo momento.';
    } else {
      tomInstrucao = '\n\n🌡️ TOM DE COMUNICAÇÃO: EQUILIBRADO — Tom amigável mas profissional. Pode usar "papi" com moderação (1x por resposta no máximo). Evite excesso de informalidade.';
    }

    // Tom por experiência
    let expInstrucao = '';
    const anosExp = parseInt(userProfile.anos_experiencia) || 0;
    if (anosExp >= 1 && anosExp <= 3) {
      expInstrucao = '\n\n📚 NÍVEL DE EXPERIÊNCIA: INICIANTE (1-3 anos) — Explique o "porquê" dos fundamentos jurídicos. Seja mais didático, contextualize a teoria por trás das estratégias. Não assuma que ele conhece todos os institutos.';
    } else if (anosExp >= 4 && anosExp <= 9) {
      expInstrucao = '\n\n📚 NÍVEL DE EXPERIÊNCIA: INTERMEDIÁRIO (4-9 anos) — Tom equilibrado. Explique apenas quando necessário ou quando o tema for complexo. Pode usar termos técnicos sem excessiva contextualização.';
    } else if (anosExp >= 10) {
      expInstrucao = '\n\n📚 NÍVEL DE EXPERIÊNCIA: SÊNIOR (10+ anos) — Vá direto ao ponto. Sem explicações básicas. Use linguagem técnica avançada, citações doutrinárias e terminologia forense sem simplificações.';
    }

    // Verificação geográfica
    let geoInstrucao = '';
    if (userProfile.estado) {
      geoInstrucao = `\n\n📍 LOCALIZAÇÃO: O advogado atua no estado de ${userProfile.estado}. Adapte quando relevante: tabela de custas estaduais, competência dos TJs/TRTs locais, legislação estadual específica (ex: ITCMD do ${userProfile.estado}, lei estadual aplicável, jurisprudência do TJ${userProfile.estado}).`;
    }

    profileCtx = `\n\n👤 PERFIL DO USUÁRIO ATUAL:
- Nome: ${userProfile.nome}
- Área: ${userProfile.area || 'não informada'}
- Experiência: ${userProfile.anos_experiencia ? userProfile.anos_experiencia + ' anos' : 'não informada'}
- Cidade: ${userProfile.cidade || 'não informada'}
- Estado: ${userProfile.estado || 'não informado'}
- OAB: ${userProfile.oab || 'não informado'}
- Escritório: ${userProfile.escritorio || 'não informado'}${memoriesText}${summariesText}${casesText}

REGRA ABSOLUTA: NUNCA pergunte o nome ou área do usuário. Você JÁ SABE quem ele é pelo perfil. Se não souber, continue sem perguntar. Chame-o pelo nome (${userProfile.nome}) e use a área (${userProfile.area || 'Direito'}) como contexto padrão. USE as memórias, resumos e casos ativos para personalizar respostas e demonstrar que lembra do advogado. Faça referências naturais: "Como naquele caso que você mencionou...", "Lembro que você estava trabalhando em...", "Pelo seu perfil de atuação em...".${tomInstrucao}${expInstrucao}${geoInstrucao}`;
  } else {
    profileCtx = '\n\nREGRA ABSOLUTA: NUNCA pergunte o nome ou área do usuário. Você JÁ SABE quem ele é pelo perfil. Se não souber, continue sem perguntar.';
  }
  
  // Pega as últimas mensagens para enriquecer a busca semântica com contexto
  const lastUserMsg = messages.filter(m => m.role === 'user').pop();
  
  let ragContext = '';
  if (lastUserMsg) {
    try {
      // Constrói query enriquecida: última msg + contexto das 3 msgs anteriores
      const recentMsgs = messages.slice(-6);
      const contextQuery = recentMsgs.map(m => m.content).join(' ') + ' ' + lastUserMsg.content;
      const relevantChunks = await searchKnowledge(contextQuery, 10, req.user.id);
      if (relevantChunks.length > 0) {
        ragContext = '\n\n━━━ BASE DE CONHECIMENTO DO RAFAEL CÂNDIA (PRIORIDADE MÁXIMA) ━━━\n';
        ragContext += 'REGRA: Estes trechos são da base real do Rafael Cândia. PRIORIZE este conteúdo acima de qualquer conhecimento genérico. Cite explicitamente: "Na base do Rafael...", "Como o Rafael ensina...", "A base mostra que...". Use as palavras e conceitos DELE, não parafraseie com linguagem genérica.\n';
        relevantChunks.forEach((chunk, i) => {
          ragContext += `\n[${i+1}] Fonte: ${chunk.original_name}\n${chunk.content}\n`;
        });
        ragContext += '\n━━━ FIM DA BASE ━━━\n';
      }
    } catch (e) {
      console.error('Erro RAG (continuando sem contexto):', e.message);
    }
  }

  // Detecta se é a primeira mensagem da conversa (sem histórico de assistant)
  const hasAssistantHistory = messages.some(m => m.role === 'assistant');
  const isFirstMessage = !hasAssistantHistory;
  
  // Contexto de personalização: NUNCA pede nome/área — REGRA ABSOLUTA (ver profileCtx)
  let personalizationCtx = '';

  // Injeta contexto do projeto (se a conversa pertence a um projeto)
  let projectCtx = '';
  if (conversation_id) {
    const conv = db.prepare('SELECT project_id FROM conversations WHERE id = ? AND user_id = ?').get(conversation_id, req.user.id);
    if (conv && conv.project_id) {
      const project = db.prepare('SELECT name, description, context_note FROM projects WHERE id = ?').get(conv.project_id);
      if (project && (project.context_note || project.description)) {
        projectCtx = '\n\n━━━ CONTEXTO DO PROJETO: ' + project.name + ' ━━━\n';
        if (project.description) projectCtx += 'Descrição: ' + project.description + '\n';
        if (project.context_note) projectCtx += 'Instruções específicas: ' + project.context_note + '\n';
        projectCtx += '━━━ FIM DO CONTEXTO DO PROJETO ━━━\nUse estas informações como contexto ao responder.';
      }
    }
  }

  // Injeta documento(s) enviado(s) na conversa
  let docCtx = '';
  const allUploadIds = upload_ids && Array.isArray(upload_ids) ? upload_ids : (upload_id ? [upload_id] : []);
  if (allUploadIds.length > 0) {
    const docs = [];
    for (const uid of allUploadIds) {
      const upload = db.prepare('SELECT original_name, page_count, extracted_text FROM conversation_uploads WHERE id = ? AND user_id = ?').get(uid, req.user.id);
      if (upload && upload.extracted_text) docs.push(upload);
    }
    if (docs.length > 0) {
      docCtx = '\n\n━━━ DOCUMENTOS ENVIADOS PELO USUÁRIO ━━━\n';
      docs.forEach((d, i) => {
        const pageInfo = d.page_count ? ` - ${d.page_count} páginas` : '';
        // Trunca texto a ~48000 chars (~12000 tokens) para caber no contexto
        const maxChars = 48000;
        let text = d.extracted_text;
        if (text.length > maxChars) {
          text = text.substring(0, maxChars) + '\n\n[...DOCUMENTO TRUNCADO - exibindo primeiros ' + Math.round(maxChars/1000) + 'K de ' + Math.round(d.extracted_text.length/1000) + 'K caracteres...]';
        }
        docCtx += `\n[DOCUMENTO ANEXADO: ${d.original_name}${pageInfo}]\n${text}\n[FIM DO DOCUMENTO]\n`;
      });
      docCtx += '━━━ FIM DOS DOCUMENTOS ━━━\nAnalise e responda com base nestes documentos quando relevante.';
    }
  }

  // Injeta tabela de honorários se o usuário perguntar sobre quanto cobrar
  let honorariosCtx = '';
  const lastMsg = messages.filter(m => m.role === 'user').pop()?.content?.toLowerCase() || '';
  const isHonorarioQuery = lastMsg.includes('cobrar') || lastMsg.includes('honorar') || 
    (lastMsg.includes('quanto') && (lastMsg.includes('ação') || lastMsg.includes('acao') || lastMsg.includes('causa') || lastMsg.includes('processo') || lastMsg.includes('tabela') || lastMsg.includes('oab'))) ||
    lastMsg.includes('tabela oab') || lastMsg.includes('tabela da oab') || lastMsg.includes('oab/') || lastMsg.includes('oab-') ||
    lastMsg.includes('valor mínimo') || lastMsg.includes('valor minimo') ||
    lastMsg.includes('precificar') || lastMsg.includes('preço') || lastMsg.includes('preco') ||
    lastMsg.includes('honorário') || lastMsg.includes('minimo de honorar') || lastMsg.includes('mínimo de honorar');
  
  if (isHonorarioQuery) {
    // detecta estado mencionado na mensagem
    const estadoMap = {
      'acre': 'AC', 'alagoas': 'AL', 'amazonas': 'AM', 'amapá': 'AP', 'amapa': 'AP',
      'bahia': 'BA', 'ceará': 'CE', 'ceara': 'CE', 'distrito federal': 'DF', ' df ': 'DF',
      'espírito santo': 'ES', 'espirito santo': 'ES', 'goiás': 'GO', 'goias': 'GO',
      'maranhão': 'MA', 'maranhao': 'MA', 'minas gerais': 'MG',
      'mato grosso do sul': 'MS', ' ms ': 'MS', 'mato grosso': 'MT', ' mt ': 'MT',
      'pará': 'PA', 'para': 'PA', 'paraíba': 'PB', 'paraiba': 'PB',
      'pernambuco': 'PE', 'piauí': 'PI', 'piaui': 'PI', 'paraná': 'PR', 'parana': 'PR',
      'rio de janeiro': 'RJ', ' rj ': 'RJ', 'rio grande do norte': 'RN',
      'rondônia': 'RO', 'rondonia': 'RO', 'roraima': 'RR',
      'rio grande do sul': 'RS', ' rs ': 'RS', 'santa catarina': 'SC', ' sc ': 'SC',
      'sergipe': 'SE', 'são paulo': 'SP', 'sao paulo': 'SP', ' sp ': 'SP',
      'tocantins': 'TO', ' to ': 'TO'
    };
    
    let estadoSigla = null;
    const msgComEspacos = ' ' + lastMsg + ' ';
    // Primeiro: tenta detectar por nome/sigla com espaços (ex: "mato grosso do sul", " ms ")
    for (const [nome, sigla] of Object.entries(estadoMap)) {
      if (msgComEspacos.includes(nome)) { estadoSigla = sigla; break; }
    }
    // Segundo: se não encontrou, tenta detectar siglas de 2 letras em qualquer posição
    // Ex: OAB/MS, OAB-SP, (RJ), "honorarios MG", etc.
    if (!estadoSigla) {
      const todasSiglas = ['AC','AL','AM','AP','BA','CE','DF','ES','GO','MA','MG','MS','MT','PA','PB','PE','PI','PR','RJ','RN','RO','RR','RS','SC','SE','SP','TO'];
      for (const sigla of todasSiglas) {
        // Captura sigla precedida e seguida por qualquer não-letra (barra, hífen, espaço, parêntese, etc)
        const regex = new RegExp('(?<![a-zA-Z])' + sigla + '(?![a-zA-Z])', 'i');
        if (regex.test(lastMsg)) { estadoSigla = sigla; break; }
      }
    }
    
    if (estadoSigla && HONORARIOS[estadoSigla]) {
      const h = HONORARIOS[estadoSigla];
      honorariosCtx = `\n\n💰 TABELA DE HONORÁRIOS OAB/${estadoSigla} (${h.ano}):\n- Cível: ${h.civel}\n- Trabalhista: ${h.trabalhista}\n- Família: ${h.familia}\n- Criminal: ${h.criminal}\n- Previdenciário/INSS: ${h.previdenciario}\n- Consulta: ${h.consulta}\n- Obs: ${h.obs}\n\nUSE ESTES DADOS para responder sobre honorários mínimos. Lembre sempre que são valores MÍNIMOS e que o advogado pode e deve cobrar mais conforme complexidade, urgência e condição do cliente.`;
    } else {
      honorariosCtx = `\n\n💰 CONTEXTO HONORÁRIOS: O usuário perguntou sobre quanto cobrar. Peça o estado onde será a ação e o tipo de caso. Você tem acesso à tabela OAB de todos os 27 estados — assim que souber o estado, poderá informar os valores mínimos exatos.`;
    }
  }

  // Regras injetadas via código para garantir aplicação em produção
  const regrasCodigo = `\n\n📊 VALORES ATUALIZADOS 2026 (OBRIGATÓRIO USAR ESTES):
- Salário mínimo: R$ 1.621,00 (vigente desde 01/01/2026, Decreto 12.797/2025)
- Teto INSS/RGPS: R$ 8.475,55
- Salário maternidade sem carência: Empregada CLT, doméstica e avulsa NÃO precisam de carência desde março/2024 (Lei 14.811/2024). Apenas contribuinte individual e facultativa precisam de 10 contribuições.
- BPC/LOAS: R$ 1.621,00\n\n⚠️ REGRA SOBRE JURISPRUDÊNCIA: Use seu conhecimento sobre tendências jurisprudenciais, valores médios e súmulas. MAS NUNCA cite número de processo específico, nome de relator ou data exata de julgamento — esses dados são verificáveis e um erro expõe o advogado. Diga "o TJMS tem entendimento consolidado de que..." sem inventar número. Se precisar de decisões específicas, oriente a buscar no JusBrasil ou no site do tribunal.\n\n⚡ TAMANHO DAS RESPOSTAS: Seja direto e objetivo. No chat normal, máximo 3 parágrafos curtos + tópicos se necessário. Não dê textao. Se o usuário quiser mais detalhes, ele pede. Apenas petições e teses completas devem ser longas.`;
  // Detecta se é petição/tese (precisa de mais tokens) ou chat normal
  const lastMsgContent = messages[messages.length-1]?.content || '';
  const lastMsgLower = lastMsgContent.toLowerCase();
  // Petição e tese precisam de mais tokens (são peças completas)
  const isPeticao = lastMsgContent.includes('CONSTRUTOR DE PETI') || lastMsgContent.includes('Petição Inicial') || lastMsgContent.includes('petição completa') || lastMsgContent.includes('peça jurídica completa') || lastMsgLower.includes('petição') || lastMsgLower.includes('peticao') || lastMsgLower.includes('inicial') || lastMsgLower.includes('contestação') || lastMsgLower.includes('contestacao') || lastMsgLower.includes('recurso') || lastMsgLower.includes('embargos') || lastMsgLower.includes('mandado de segurança') || lastMsgLower.includes('habeas corpus') || lastMsgLower.includes('agravo') || lastMsgLower.includes('apelação') || lastMsgLower.includes('apelacao') || lastMsgLower.includes('impugnação') || lastMsgLower.includes('réplica') || lastMsgLower.includes('replica') || lastMsgLower.includes('contrarrazões') || lastMsgLower.includes('contrarrazoes');
  const isTese = lastMsgContent.includes('PACOTE COMPLETO DE TESE') || lastMsgLower.includes('tese jurídica') || lastMsgLower.includes('tese juridica') || lastMsgLower.includes('teses jurídicas') || lastMsgLower.includes('teses juridicas') || lastMsgLower.includes('teses escaláveis') || lastMsgLower.includes('teses escalaveis') || lastMsgLower.includes('montar tese') || lastMsgLower.includes('elaborar tese') || lastMsgLower.includes('construir tese') || lastMsgLower.includes('gere uma tese') || lastMsgLower.includes('gerar tese');
  const temDocumento = allUploadIds.length > 0 || docCtx.length > 100;
  // Premium: petições sem corte, teses completas, análise profunda
  const maxTok = isPeticao ? 32000 : isTese ? 16000 : temDocumento ? 8000 : 2500;

  // ── FORMATO LIMPO: instrução por tipo de peça (itens 3, 4, 6, 7) ──
  let formatoCtx = '';
  if (isPeticao) {
    const _cidade = userProfile?.cidade || '';
    const _estado = userProfile?.estado || '';
    const _nome = userProfile?.nome || '';
    const _oab = userProfile?.oab || '';
    const _escritorio = userProfile?.escritorio || '';
    const _rodape = (_oab || _escritorio) ? 
      `\n\n${_cidade}${_estado ? (_cidade ? ' - ' : '') + _estado : ''}, [DATA].\n${_nome}${_oab ? '\nOAB/' + _estado + ' Nº ' + _oab : ''}${_escritorio ? '\n' + _escritorio : ''}` : '';
    formatoCtx = `\n\n📄 MODO PETIÇÃO ATIVADO — REGRA INVIOLAVEL: Independente do tom configurado pelo usuário (descontraído, equilibrado ou formal), petições e peças jurídicas usam SEMPRE linguagem forense formal. ZERO "papi", ZERO "AUUUU", ZERO expressões capivarísticas, ZERO emojis no corpo da peça. A peça deve parecer escrita por um advogado sênior.

🧠 METODOLOGIA INTERNA (NÃO APARECE NA PEÇA):
Antes de redigir, processe internamente a argumentação usando a metodologia IRAC (Issue, Rule, Application, Conclusion) para cada ponto principal. O objetivo é construir raciocínio lógico e irrefutável conectando regras jurídicas aos fatos. Em hipótese alguma coloque nomenclaturas como "IRAC" na peça — deve estar enraizado na escrita, intrínseco.

📐 ESTRUTURA DA PEÇA ("Projeto de Sentença" — Art. 489 CPC):
Construa a peça espelhando a lógica decisória do juiz:
- "DOS FATOS": Narração coesa e persuasiva que contextualize a lide e apresente a versão da verdade do cliente de forma completa (espelha o Relatório).
- "DO DIREITO": Construção da tese jurídica demonstrando como o programa normativo se aplica ao âmbito normativo. Cada argumento com silogismo: premissa maior (norma) + premissa menor (fato provado) = conclusão. (espelha a Fundamentação).
- "DOS PEDIDOS": Pedidos redigidos como comandos decisórios claros, diretos e coerentes, prontos para o juiz "copiar e colar" no dispositivo. Pedidos fechados, escalonados: principal + subsidiários + sucessivos. (espelha o Dispositivo).
O ponto é: explicar o Direito do cliente ao juiz atrelado aos fatos, e NÃO ensinar direito ao juiz.

🎯 PERSUASÃO E ESTRATÉGIA:
- Reduza a carga cognitiva do juiz: tópicos curtos, frases diretas, estrutura visual clara, listas e pedidos prontos.
- Explore cada erro, omissão, contradição ou fragilidade da parte adversária.
- Use negrito de forma pontual para destacar pontos fortes, guiando a leitura do julgador.
- Antecipe argumentos da parte contrária e neutralize-os preventivamente.
- Dê preferência a precedentes obrigatórios: temas repetitivos do STJ, teses de repercussão geral do STF, súmulas vinculantes.

🚫 PROIBIÇÃO ABSOLUTA DE ALUCINAÇÃO:
- TERMINANTEMENTE proibido inventar dados, fatos, artigos de lei, normas ou jurisprudências inexistentes.
- Faça verificação cruzada de todas as citações jurídicas com as fontes fornecidas.
- Quando citar jurisprudência, use preferencialmente súmulas e temas consolidados. Se citar decisão específica sem certeza do número, escreva: "(confirme no JusBrasil antes de protocolar)".
- Se não houver base normativa clara, assuma que é tese construtiva/doutrinária e sinalize.

📋 REGRAS DE ENTREGA:
- Entregue APENAS a petição. Sem comentários extras, sugestões de reels, hashtags ou scripts.
- Use [NOME DO RÉU], [DATA DO FATO], [COMARCA] para campos não informados.
- Ao final da petição, adicione obrigatoriamente:
  ⚠️ Antes de protocolar:
  • [alerte sobre súmulas que podem contrariar a tese]
  • [campos que precisam ser preenchidos pelo advogado]
  • [documentos que precisam ser anexados]
  • [jurisprudência que precisa ser verificada no JusBrasil]

  📌 Escolhas estratégicas: [resumo conciso em 2-3 marcadores das principais decisões argumentativas tomadas na redação — serve como checklist para o advogado revisar]

  📌 Plano B: [estratégia alternativa concreta caso a tese principal não prospere]

- Ao final, inclua o rodapé de assinatura:${_rodape || '\n\n[Cidade/UF], [DATA].\n[Nome do Advogado]\nOAB/[Estado] Nº [Número]'}`;
  } else if (isTese) {
    // Verifica se é pedido de conteúdo para redes (aí pode usar o formato com reels)
    const isConteudo = /instagram|reels|carrossel|post|conte[úu]do|legenda|hashtag|redes/i.test(lastMsgLower);
    if (isConteudo) {
      formatoCtx = `\n\n📱 MODO CONTEÚDO PARA REDES ATIVADO: O usuário quer conteúdo para redes sociais. Use o formato completo com Reels, hashtags e scripts.`;
    } else {
      formatoCtx = `\n\n⚖️ MODO TESE JURÍDICA ATIVADO — REGRAS ABSOLUTAS:
INDEPENDENTE do tom configurado, teses jurídicas SEMPRE usam linguagem técnica formal. ZERO "papi", ZERO "AUUUU", ZERO expressões capivarísticas no corpo da tese.\nIGNORE completamente o formato padrão de tese com campos de Reels, Carrossel, hashtags e scripts de atendimento.\n\nMETODOLOGIA: Use internamente o raciocínio IRAC (Issue, Rule, Application, Conclusion) para estruturar cada argumento. NÃO exponha a metodologia — ela deve estar enraizada na escrita.\n\nATUAÇÃO ESTRATÉGICA:\n- Atue como defensor implacável dos interesses do cliente, com classe, legalidade e persuasão.\n- Explore erros, omissões e fragilidades da parte adversária.\n- Antecipe vulnerabilidades e "vacine" preventivamente o processo.\n- Considere 2-3 abordagens diferentes para questões complexas. Apresente a mais consistente e explique por que as outras foram descartadas.\n\nEntregue APENAS:\n1. Fundamentos legais (artigos de lei com números)\n2. Jurisprudência (preferência para temas repetitivos STJ, repercussão geral STF, súmulas vinculantes. Se citar número específico, adicione "(confirme no JusBrasil antes de protocolar)")\n3. Argumentação jurídica profunda e adaptada ao caso\n4. Bloco obrigatório ao final:\n\n⚠️ Atenção antes de protocolar:\n• [súmulas que podem contrariar a tese]\n• [jurisprudência divergente]\n• [riscos processuais específicos]\n\n📌 Plano B: [estratégia alternativa concreta caso a tese principal não prospere]\n\nNÃO inclua: 🎯 Ideia de Reels, 📝 Legenda educativa, #️⃣ Hashtags, 💬 Script de atendimento, 🔄 Status, 🏷️ Tags de complexidade.`;
    }
  } else {
    // Chat normal: regras de jurisprudência + autonomia intelectual
    formatoCtx = `\n\n📌 REGRA JURISPRUDÊNCIA: Quando citar STJ, STF ou outros tribunais, SEMPRE inclua o número do julgado (REsp, RE, Tema, Súmula). Se não souber o número exato, escreva: "(confirme no JusBrasil antes de protocolar)" ao lado da citação.\n\n🧠 AUTONOMIA INTELECTUAL: Você não deve simplesmente concordar com as premissas do usuário. Sua função é ser um parceiro intelectual crítico. Se o advogado apresentar uma ideia, analise as premissas, aponte pontos frágeis, ofereça contrapontos quando pertinente, e priorize a verdade. Corrija-o com respeito se a lógica estiver fraca. Proibido ser preguicoso ou dar conclusões genéricas — profundidade e precisão são obrigatórias.`;
  }

  const fullSystemPrompt = systemPrompt + ragContext + profileCtx + projectCtx + docCtx + personalizationCtx + honorariosCtx + regrasCodigo + formatoCtx;

  // Tenta a chamada OpenAI com retry automático (até 2 tentativas)
  let response, data;
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 90000); // 90s timeout
      // Fine-tuned CAPI disponível mas mantemos gpt-4.1 em produção até base crescer
      // Para ativar fine-tuned: trocar 'gpt-4.1' por CAPI_FINETUNED_MODEL abaixo
      response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${OPENAI_API_KEY}` },
        body: JSON.stringify({
          model: 'gpt-4.1',
          messages: [{ role: 'system', content: fullSystemPrompt }, ...messages.slice(-20)],
          temperature: 0.75,
          max_tokens: maxTok,
          store: false,
          user: 'capi_user_' + req.user.id
        }),
        signal: controller.signal
      });
      clearTimeout(timeout);
      data = await response.json();
      if (response.ok) break; // sucesso, sai do loop
      if (attempt === 2) {
        const errMsg = data.error?.message || 'Erro na OpenAI';
        // Erro de quota/billing → mensagem amigável sem expor detalhes
        if (errMsg.includes('quota') || errMsg.includes('billing') || errMsg.includes('insufficient') || response.status === 429) {
          console.error('🚨 OpenAI quota exceeded:', errMsg);
          return res.status(503).json({ error: 'A Capi está com alta demanda no momento. Estamos resolvendo — tente novamente em alguns minutos.' });
        }
        return res.status(502).json({ error: errMsg });
      }
      console.log(`⚠️ Tentativa ${attempt} falhou, tentando novamente...`);
    } catch(fetchErr) {
      if (attempt === 2) return res.status(504).json({ error: 'A resposta está demorando mais que o normal. Tente uma pergunta mais curta ou envie novamente.' });
      console.log(`⚠️ Timeout tentativa ${attempt}, retentando...`);
    }
  }

  try {

    const reply = data.choices[0].message.content;
    const tokens = data.usage?.total_tokens || 0;
    const userId = req.user.id;

    let convId = conversation_id;
    if (!convId) {
      const firstUserMsg = messages.find(m => m.role === 'user');
      const title = sanitizeInput(firstUserMsg ? firstUserMsg.content.substring(0, 60) : 'Nova conversa');
      const conv = project_id
        ? db.prepare('INSERT INTO conversations (user_id, title, project_id) VALUES (?, ?, ?)').run(userId, title, project_id)
        : db.prepare('INSERT INTO conversations (user_id, title) VALUES (?, ?)').run(userId, title);
      convId = conv.lastInsertRowid;
    } else {
      // Verificar ownership da conversa (proteção IDOR)
      const convOwner = db.prepare('SELECT id FROM conversations WHERE id = ? AND user_id = ?').get(convId, userId);
      if (!convOwner) {
        return res.status(403).json({ error: 'Acesso negado a esta conversa' });
      }
      db.prepare("UPDATE conversations SET updated_at = datetime('now') WHERE id = ?").run(convId);
    }

    const lastMsg = messages[messages.length - 1];
    db.prepare('INSERT INTO messages (conversation_id, user_id, role, content, tokens) VALUES (?, ?, ?, ?, ?)').run(convId, userId, 'user', lastMsg.content, 0);
    db.prepare('INSERT INTO messages (conversation_id, user_id, role, content, tokens) VALUES (?, ?, ?, ?, ?)').run(convId, userId, 'assistant', reply, tokens);

    // Auto-detectar e salvar perfil se usuário informou nome/área
    if (isFirstMessage) {
      db.prepare("INSERT INTO message_analytics (user_id, message_type) VALUES (?, 'first_message')").run(userId);
    }

    // TAREFA 6 — Auto-detectar nome e área na mensagem do usuário
    const userMsg = messages[messages.length - 1]?.content || '';
    const existingProfile = db.prepare('SELECT * FROM user_profiles WHERE user_id = ?').get(userId);
    if (!existingProfile?.nome || !existingProfile?.area) {
      const nomeMatch = userMsg.match(/(?:me chamo|meu nome é|sou o|sou a|pode me chamar de)\s+([A-ZÀ-Ú][a-zà-ú]+(?:\s+[A-ZÀ-Ú][a-zà-ú]+)?)/i);
      const areaMatch = userMsg.match(/(?:trabalho com|atuo em|área de|sou advogado de|especializ[ao] em)\s+([^.,!?]+)/i);
      if (nomeMatch || areaMatch) {
        const nome = nomeMatch ? nomeMatch[1] : existingProfile?.nome;
        const area = areaMatch ? areaMatch[1].trim() : existingProfile?.area;
        db.prepare('INSERT OR REPLACE INTO user_profiles (user_id, nome, area, cidade, estado, anos_experiencia, tom_preferido, oab, escritorio, bio, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime("now"))').run(userId, nome || null, area || null, existingProfile?.cidade || null, existingProfile?.estado || null, existingProfile?.anos_experiencia || null, existingProfile?.tom_preferido || 'equilibrado', existingProfile?.oab || null, existingProfile?.escritorio || null, existingProfile?.bio || null);
      }
    }

    // TAREFA 3 — Gerar sugestões contextuais de follow-up
    let suggestions = [];
    try {
      const sugResponse = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${OPENAI_API_KEY}` },
        body: JSON.stringify({
          model: 'gpt-4o-mini',
          messages: [
            { role: 'system', content: `Você é a Capi, assistente jurídica estratégica. Gere EXATAMENTE 4 sugestões de próximos passos para o advogado.

REGRAS:
- 100% relacionadas ao tema da conversa
- Máximo 7 palavras cada, começar com verbo
- NUNCA sugerir autocuidado, meditação ou qualquer coisa não jurídica
- Sugestões devem ser IRRESISTÍVEIS — o advogado deve querer clicar

CONTEXTO POR TIPO:
- Petição/peça → recurso, embargos, estratégia alternativa, baixar DOCX
- Tese → petição com a tese, conteúdo Instagram, honorários
- Honorários → proposta, contrato, estratégia de cobrança
- Conteúdo Instagram → criar sequência da semana, carrossel, reel, stories
- Análise de documento → estratégia processual, petição, checklist
- Cálculo → petição com os valores, honorários, proposta ao cliente
- Consulta geral → tese aprofundada, petição, conteúdo para redes

A 4ª sugestão SEMPRE deve ser algo diferente do tema atual para expandir o uso (ex: se falou de tese, sugira conteúdo Instagram; se falou de petição, sugira honorários).

Retorne APENAS um JSON array de 4 strings.` },
            { role: 'user', content: 'Pergunta do advogado: "' + (messages[messages.length-1]?.content||'').substring(0,300) + '" / Resposta da Capi: "' + reply.substring(0,500) + '"' }
          ],
          temperature: 0.6,
          max_tokens: 200,
          store: false,
          user: 'capi_user_' + userId
        })
      });
      if (sugResponse.ok) {
        const sugData = await sugResponse.json();
        const sugText = sugData.choices[0]?.message?.content || '[]';
        const parsed = JSON.parse(sugText.replace(/```json?\n?/g, '').replace(/```/g, '').trim());
        if (Array.isArray(parsed)) suggestions = parsed.slice(0, 4);
        try {
          const sugInTok = sugData.usage?.prompt_tokens || 0;
          const sugOutTok = sugData.usage?.completion_tokens || 0;
          const sugCost = (sugInTok/1e6)*0.15 + (sugOutTok/1e6)*0.60;
          logAiUsage(userId, 'suggestions', 'gpt-4o-mini', sugInTok, sugOutTok, 0, sugCost);
        } catch(e) {}
      }
    } catch (e) {
      console.error('Erro ao gerar sugestões:', e.message);
    }

    res.json({ reply, tokens, conversation_id: convId, suggestions });

    // Log AI usage for chat
    try {
      const chatUserMsg = messages[messages.length - 1]?.content || '';
      const chatInputTokens = Math.round(fullSystemPrompt.length / 3.5) + Math.round(chatUserMsg.length / 3.5);
      const chatOutputTokens = Math.round(reply.length / 3.5);
      const chatCost = (chatInputTokens/1e6)*2.00 + (chatOutputTokens/1e6)*8.00;
      logAiUsage(userId, 'chat', 'gpt-4.1', chatInputTokens, chatOutputTokens, 0, chatCost);
    } catch(e) { console.error('Erro log chat usage:', e.message); }

    // ─── MEMÓRIA TURBINADA — extrai insights + resumo + casos em background ───
    setImmediate(async () => {
      try {
        const memUserMsg = messages[messages.length - 1]?.content || '';
        const memReply = reply;
        const memUserId = userId;
        
        // 1. EXTRAÇÃO DE INSIGHTS (upgraded — mais contexto, gpt-4.1-nano para economia)
        const memResponse = await fetch('https://api.openai.com/v1/chat/completions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${OPENAI_API_KEY}` },
          body: JSON.stringify({
            model: 'gpt-4.1-nano',
            messages: [
              { role: 'system', content: `Você é o sistema de memória de longo prazo da CAPI, uma IA jurídica brasileira. Analise a conversa completa e extraia insights RELEVANTES e DURÁVEIS sobre o advogado.

CATEGORIAS (use exatamente estas):
- "casos": tipos de caso, processos específicos, resultados obtidos
- "clientes": perfil dos clientes, segmento, poder aquisitivo
- "preferencias": como prefere trabalhar, horários, ferramentas
- "especialidade": subáreas, nichos, teses favoritas
- "escritorio": estrutura, sócios, funcionários, localização
- "estilo": tom de petições, argumentação preferida, nível técnico
- "desafios": dificuldades recorrentes, pontos fracos, frustrações
- "conquistas": vitórias, resultados, marcos profissionais
- "networking": referências a colegas, juízes, contatos
- "metas": objetivos profissionais, planos futuros

REGRAS:
- Máximo 5 insights por análise
- Cada insight deve ter 15-80 palavras
- NUNCA guarde nome, área principal, ou dados já no perfil básico
- Guarde DETALHES ESPECÍFICOS (ex: "Ganhou causa contra Unimed por negativa de home care" não apenas "trabalha com planos de saúde")
- Se não houver insights relevantes, retorne []

Retorne APENAS um JSON array: [{category, insight, importance}]
importance: 1-5 (5=muito importante, ex: vitória em caso; 1=detalhe menor)` },
              { role: 'user', content: `Conversa completa:
Advogado: "${memUserMsg.substring(0, 800)}"
CAPI: "${memReply.substring(0, 800)}"` }
            ],
            temperature: 0.2,
            max_tokens: 500,
            store: false,
            user: 'capi_user_' + memUserId
          })
        });

        if (memResponse.ok) {
          const memData = await memResponse.json();
          const memText = memData.choices[0]?.message?.content || '[]';
          try {
            const insights = JSON.parse(memText.replace(/```json?\n?/g, '').replace(/```/g, '').trim());
            if (Array.isArray(insights) && insights.length > 0) {
              const existing = db.prepare('SELECT insight FROM user_memory WHERE user_id = ?').all(memUserId).map(r => r.insight.toLowerCase());
              insights.forEach(({ category, insight, importance }) => {
                if (category && insight && insight.length > 10) {
                  const isDuplicate = existing.some(e => {
                    const words = insight.toLowerCase().split(' ').filter(w => w.length > 4);
                    const matchCount = words.filter(w => e.includes(w)).length;
                    return matchCount >= Math.min(3, words.length * 0.6);
                  });
                  if (!isDuplicate) {
                    db.prepare('INSERT INTO user_memory (user_id, category, insight, relevance_score, source) VALUES (?, ?, ?, ?, ?)').run(
                      memUserId, category, insight, importance || 1.0, 'chat'
                    );
                  }
                }
              });
            }
          } catch(parseErr) { /* JSON parse error — silencioso */ }
          
          // Log do custo da memória
          try {
            const memInputTok = Math.round((memUserMsg.length + memReply.length) / 3.5) + 300;
            const memOutputTok = Math.round((memText.length) / 3.5);
            logAiUsage(memUserId, 'memory_extraction', 'gpt-4.1-nano', memInputTok, memOutputTok, 0, (memInputTok/1e6)*0.10 + (memOutputTok/1e6)*0.40);
          } catch(e) {}
        }
        
        // 2. DETECÇÃO DE CASOS ATIVOS — procura menções a processos, clientes, prazos
        try {
          const caseResponse = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${OPENAI_API_KEY}` },
            body: JSON.stringify({
              model: 'gpt-4.1-nano',
              messages: [
                { role: 'system', content: `Analise se o advogado mencionou um CASO ATIVO ou CLIENTE ESPECÍFICO. Extraia apenas se for concreto (não hipotético).

Se houver caso concreto, retorne: {"found": true, "titulo": "breve título do caso", "cliente": "nome se mencionado", "area": "área jurídica", "detalhes": "contexto relevante", "proximo_passo": "se mencionou próximo passo", "prazo": "se mencionou prazo/data"}
Se não houver caso concreto: {"found": false}` },
                { role: 'user', content: `Advogado: "${memUserMsg.substring(0, 500)}"\nCAPI: "${memReply.substring(0, 300)}"` }
              ],
              temperature: 0.1,
              max_tokens: 200,
              store: false,
              user: 'capi_user_' + memUserId
            })
          });

          if (caseResponse.ok) {
            const caseData = await caseResponse.json();
            const caseText = caseData.choices[0]?.message?.content || '{}';
            try {
              const caseInTok = caseData.usage?.prompt_tokens || 0;
              const caseOutTok = caseData.usage?.completion_tokens || 0;
              const caseCost = (caseInTok/1e6)*0.10 + (caseOutTok/1e6)*0.40;
              logAiUsage(memUserId, 'case_detection', 'gpt-4.1-nano', caseInTok, caseOutTok, 0, caseCost);
            } catch(e) {}
            try {
              const caseInfo = JSON.parse(caseText.replace(/```json?\n?/g, '').replace(/```/g, '').trim());
              if (caseInfo.found && caseInfo.titulo) {
                // Verifica se caso similar já existe
                const existingCases = db.prepare('SELECT titulo FROM user_cases WHERE user_id = ? AND status = ?').all(memUserId, 'ativo').map(r => r.titulo.toLowerCase());
                const isDupCase = existingCases.some(t => {
                  const words = caseInfo.titulo.toLowerCase().split(' ').filter(w => w.length > 3);
                  return words.filter(w => t.includes(w)).length >= 2;
                });
                if (!isDupCase) {
                  db.prepare('INSERT INTO user_cases (user_id, titulo, cliente, area, detalhes, proximo_passo, prazo) VALUES (?, ?, ?, ?, ?, ?, ?)').run(
                    memUserId, caseInfo.titulo, caseInfo.cliente || null, caseInfo.area || null,
                    caseInfo.detalhes || null, caseInfo.proximo_passo || null, caseInfo.prazo || null
                  );
                }
              }
            } catch(e) { /* parse error */ }
          }
        } catch(e) { /* case detection error — silencioso */ }
        
        // 3. RESUMO DE CONVERSA — salva ao atingir 6+ mensagens
        try {
          const msgCount = db.prepare('SELECT COUNT(*) as c FROM messages WHERE conversation_id = ?').get(convId)?.c || 0;
          const existingSummary = db.prepare('SELECT id FROM conversation_summaries WHERE conversation_id = ?').get(convId);
          
          if (msgCount >= 6 && !existingSummary) {
            const convMsgs = db.prepare('SELECT role, content FROM messages WHERE conversation_id = ? ORDER BY id ASC LIMIT 30').all(convId);
            const convText = convMsgs.map(m => `${m.role === 'user' ? 'Advogado' : 'CAPI'}: ${m.content.substring(0, 200)}`).join('\n');

            const sumResponse = await fetch('https://api.openai.com/v1/chat/completions', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${OPENAI_API_KEY}` },
              body: JSON.stringify({
                model: 'gpt-4.1-nano',
                messages: [
                  { role: 'system', content: `Resuma esta conversa jurídica em 2-3 frases objetivas. Inclua: tema principal, conclusão/resultado, e qualquer ação pendente. Retorne JSON: {"summary": "...", "key_topics": "tópico1, tópico2", "action_items": "item1; item2 (ou null)", "emotional_tone": "satisfeito|frustrado|neutro|urgente|exploratório"}` },
                  { role: 'user', content: convText.substring(0, 2000) }
                ],
                temperature: 0.2,
                max_tokens: 300,
                store: false,
                user: 'capi_user_' + memUserId
              })
            });
            
            if (sumResponse.ok) {
              const sumData = await sumResponse.json();
              const sumText = sumData.choices[0]?.message?.content || '{}';
              try {
                const sumInTok = sumData.usage?.prompt_tokens || 0;
                const sumOutTok = sumData.usage?.completion_tokens || 0;
                const sumCost = (sumInTok/1e6)*0.10 + (sumOutTok/1e6)*0.40;
                logAiUsage(memUserId, 'conversation_summary', 'gpt-4.1-nano', sumInTok, sumOutTok, 0, sumCost);
              } catch(e) {}
              try {
                const sumInfo = JSON.parse(sumText.replace(/```json?\n?/g, '').replace(/```/g, '').trim());
                if (sumInfo.summary) {
                  db.prepare('INSERT INTO conversation_summaries (user_id, conversation_id, summary, key_topics, action_items, emotional_tone) VALUES (?, ?, ?, ?, ?, ?)').run(
                    memUserId, convId, sumInfo.summary, sumInfo.key_topics || null, sumInfo.action_items || null, sumInfo.emotional_tone || 'neutro'
                  );
                }
              } catch(e) {}
            }
          } else if (existingSummary && msgCount >= 12 && msgCount % 6 === 0) {
            // Atualiza resumo a cada 6 mensagens adicionais
            const convMsgs = db.prepare('SELECT role, content FROM messages WHERE conversation_id = ? ORDER BY id ASC LIMIT 40').all(convId);
            const convText = convMsgs.map(m => `${m.role === 'user' ? 'Advogado' : 'CAPI'}: ${m.content.substring(0, 200)}`).join('\n');

            const sumResponse = await fetch('https://api.openai.com/v1/chat/completions', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${OPENAI_API_KEY}` },
              body: JSON.stringify({
                model: 'gpt-4.1-nano',
                messages: [
                  { role: 'system', content: `Resuma esta conversa jurídica em 2-3 frases objetivas. Inclua: tema principal, conclusão/resultado, e qualquer ação pendente. Retorne JSON: {"summary": "...", "key_topics": "tópico1, tópico2", "action_items": "item1; item2 (ou null)", "emotional_tone": "satisfeito|frustrado|neutro|urgente|exploratório"}` },
                  { role: 'user', content: convText.substring(0, 2000) }
                ],
                temperature: 0.2,
                max_tokens: 300,
                store: false,
                user: 'capi_user_' + memUserId
              })
            });
            
            if (sumResponse.ok) {
              const sumData = await sumResponse.json();
              const sumText = sumData.choices[0]?.message?.content || '{}';
              try {
                const sumInTok = sumData.usage?.prompt_tokens || 0;
                const sumOutTok = sumData.usage?.completion_tokens || 0;
                const sumCost = (sumInTok/1e6)*0.10 + (sumOutTok/1e6)*0.40;
                logAiUsage(memUserId, 'conversation_summary', 'gpt-4.1-nano', sumInTok, sumOutTok, 0, sumCost);
              } catch(e) {}
              try {
                const sumInfo = JSON.parse(sumText.replace(/```json?\n?/g, '').replace(/```/g, '').trim());
                if (sumInfo.summary) {
                  db.prepare('UPDATE conversation_summaries SET summary = ?, key_topics = ?, action_items = ?, emotional_tone = ? WHERE conversation_id = ?').run(
                    sumInfo.summary, sumInfo.key_topics || null, sumInfo.action_items || null, sumInfo.emotional_tone || 'neutro', convId
                  );
                }
              } catch(e) {}
            }
          }
        } catch(e) { /* summary error — silencioso */ }
        
      } catch (memErr) {
        // Silencioso — memória é best-effort
        console.error('Memory system error:', memErr.message);
      }
    });

  } catch (e) {
    console.error('Erro chat endpoint:', e.message, e.stack?.split('\n')[1]);
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

// ─── ADMIN ────────────────────────────────────────────────────

app.get('/api/admin/security-logs', adminMiddleware, (req, res) => {
  try {
    const logs = db.prepare('SELECT * FROM security_logs ORDER BY created_at DESC LIMIT 200').all();
    res.json({ logs });
  } catch(e) {
    res.json({ logs: [] });
  }
});

app.get('/api/admin/security-stats', adminMiddleware, (req, res) => {
  try {
    const total = db.prepare('SELECT COUNT(*) as count FROM security_logs').get();
    const failed = db.prepare("SELECT COUNT(*) as count FROM security_logs WHERE event_type = 'failed_login'").get();
    const blocked = db.prepare("SELECT COUNT(*) as count FROM security_logs WHERE event_type = 'blocked_ip'").get();
    const rateLimited = db.prepare("SELECT COUNT(*) as count FROM security_logs WHERE event_type = 'rate_limited'").get();
    const activeBlocks = loginAttempts.size;
    res.json({ 
      total: total.count,
      failed_logins: failed.count,
      blocked_ips: blocked.count,
      rate_limited: rateLimited.count,
      active_blocks: activeBlocks
    });
  } catch(e) {
    res.json({ total: 0, failed_logins: 0, blocked_ips: 0, rate_limited: 0, active_blocks: 0 });
  }
});

// ─── ADMIN: BACKUPS ─────────────────────────────────────────────
app.get('/api/admin/backups', adminMiddleware, (req, res) => {
  try {
    const files = fs.readdirSync(BACKUP_DIR)
      .filter(f => f.startsWith('capi-backup-') && f.endsWith('.db'))
      .sort()
      .reverse()
      .map(f => ({
        name: f,
        size: fs.statSync(path.join(BACKUP_DIR, f)).size,
        created: f.replace('capi-backup-', '').replace('.db', '')
      }));
    res.json({ backups: files, backup_dir: BACKUP_DIR });
  } catch(e) {
    console.error('Erro ao listar backups:', e);
    res.json({ backups: [], error: 'Erro interno do servidor' });
  }
});

app.post('/api/admin/backup-now', adminMiddleware, async (req, res) => {
  try {
    await performBackup();
    res.json({ ok: true, message: 'Backup realizado com sucesso!' });
  } catch(e) {
    console.error('Erro ao realizar backup:', e);
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

app.get('/api/admin/cache-stats', adminMiddleware, (req, res) => {
  res.json({ disabled: true, reason: 'Cache removed for data privacy' });
});

app.get('/api/admin/stats', adminMiddleware, (req, res) => {
  const totalUsers = db.prepare('SELECT COUNT(*) as c FROM users').get().c;
  const activeUsers = db.prepare('SELECT COUNT(*) as c FROM users WHERE active = 1').get().c;
  const totalMessages = db.prepare("SELECT COUNT(*) as c FROM messages WHERE role = 'user'").get().c;
  const totalTokens = db.prepare('SELECT SUM(tokens) as s FROM messages').get().s || 0;
  const totalConversations = db.prepare('SELECT COUNT(*) as c FROM conversations').get().c;
  const todayMessages = db.prepare("SELECT COUNT(*) as c FROM messages WHERE role='user' AND date(created_at) = date('now')").get().c;
  const knowledgeFiles = db.prepare("SELECT COUNT(*) as c FROM knowledge_files WHERE status = 'ready'").get().c;
  const totalChunks = db.prepare('SELECT COUNT(*) as c FROM knowledge_chunks WHERE embedding IS NOT NULL').get().c;
  res.json({ totalUsers, activeUsers, totalMessages, totalTokens, totalConversations, todayMessages, knowledgeFiles, totalChunks });
});

app.get('/api/admin/users', adminMiddleware, (req, res) => {
  const users = db.prepare(`
    SELECT u.id, u.name, u.email, u.active, u.created_at, u.last_login,
           u.plan_type, u.plan_expires_at, u.plan_activated_at, u.pagarme_subscription_id,
           u.welcome_email_sent, u.subscription_tier,
           COUNT(DISTINCT c.id) as total_conversations,
           COUNT(m.id) as total_messages
    FROM users u
    LEFT JOIN conversations c ON c.user_id = u.id
    LEFT JOIN messages m ON m.user_id = u.id AND m.role = 'user'
    GROUP BY u.id
    ORDER BY u.created_at DESC
  `).all();
  res.json(users);
});

app.post('/api/admin/users', adminMiddleware, async (req, res) => {
  const { name, email, password } = req.body;
  if (!name || !email || !password) return res.status(400).json({ error: 'Preencha todos os campos' });
  try {
    const hash = await bcrypt.hash(password, 10);
    const result = db.prepare('INSERT INTO users (name, email, password) VALUES (?, ?, ?)').run(name, email.toLowerCase(), hash);
    res.json({ id: result.lastInsertRowid, name, email, active: 1 });
  } catch (e) {
    if (e.message.includes('UNIQUE')) return res.status(400).json({ error: 'Email já cadastrado' });
    res.status(500).json({ error: 'Erro ao criar usuário' });
  }
});

app.patch('/api/admin/users/:id', adminMiddleware, (req, res) => {
  const { active, name, email } = req.body;
  if (name !== undefined) {
    db.prepare('UPDATE users SET name = ? WHERE id = ?').run(name, req.params.id);
  }
  if (active !== undefined) {
    db.prepare('UPDATE users SET active = ? WHERE id = ?').run(active ? 1 : 0, req.params.id);
  }
  if (email !== undefined) {
    db.prepare('UPDATE users SET email = ? WHERE id = ?').run(email.toLowerCase().trim(), req.params.id);
  }
  const user = db.prepare('SELECT id, name, email, active FROM users WHERE id = ?').get(req.params.id);
  res.json({ success: true, user });
});

// Limpa memórias acumuladas de um usuário
app.delete('/api/admin/users/:id/memory', adminMiddleware, (req, res) => {
  db.prepare('DELETE FROM user_memory WHERE user_id = ?').run(req.params.id);
  res.json({success: true, message: 'Memórias limpas'});
});

app.delete('/api/admin/users/:id', adminMiddleware, (req, res) => {
  db.prepare('DELETE FROM messages WHERE user_id = ?').run(req.params.id);
  db.prepare('DELETE FROM conversations WHERE user_id = ?').run(req.params.id);
  db.prepare('DELETE FROM users WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

app.patch('/api/admin/users/:id/password', adminMiddleware, async (req, res) => {
  const { password } = req.body;
  if (!password) return res.status(400).json({ error: 'Nova senha obrigatória' });
  const hash = await bcrypt.hash(password, 10);
  db.prepare('UPDATE users SET password = ? WHERE id = ?').run(hash, req.params.id);
  res.json({ success: true });
});

app.get('/api/admin/users/:id/conversations', adminMiddleware, (req, res) => {
  const convs = db.prepare(`
    SELECT c.id, c.title, c.created_at, c.updated_at, COUNT(m.id) as msg_count
    FROM conversations c
    LEFT JOIN messages m ON m.conversation_id = c.id
    WHERE c.user_id = ?
    GROUP BY c.id ORDER BY c.updated_at DESC
  `).all(req.params.id);
  res.json(convs);
});

app.get('/api/admin/prompt', adminMiddleware, (req, res) => {
  const row = db.prepare("SELECT value FROM settings WHERE key = 'system_prompt'").get();
  res.json({ prompt: row?.value || '' });
});

app.put('/api/admin/prompt', adminMiddleware, (req, res) => {
  const { prompt } = req.body;
  if (!prompt) return res.status(400).json({ error: 'Prompt inválido' });
  db.prepare("INSERT OR REPLACE INTO settings (key, value, updated_at) VALUES ('system_prompt', ?, datetime('now'))").run(prompt);
  res.json({ success: true });
});

// ─── ADMIN: KNOWLEDGE / RAG ───────────────────────────────────

// Listar arquivos de conhecimento
app.get('/api/admin/knowledge', adminMiddleware, (req, res) => {
  const files = db.prepare('SELECT id, original_name, file_size, chunk_count, status, created_at FROM knowledge_files ORDER BY created_at DESC').all();
  res.json(files);
});

// Upload de arquivo
app.post('/api/admin/knowledge/upload', adminMiddleware, upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Nenhum arquivo enviado' });
  
  const fileId = db.prepare(
    'INSERT INTO knowledge_files (filename, original_name, file_path, file_size, status) VALUES (?, ?, ?, ?, ?)'
  ).run(req.file.filename, req.file.originalname, req.file.path, req.file.size, 'processing').lastInsertRowid;
  
  // Processa em background
  processFile(fileId).catch(e => console.error('Erro processamento background:', e.message));
  
  res.json({ 
    id: fileId, 
    original_name: req.file.originalname, 
    file_size: req.file.size,
    status: 'processing',
    message: 'Arquivo recebido! Gerando embeddings em background...'
  });
});

// Status de processamento de um arquivo
app.get('/api/admin/knowledge/:id/status', adminMiddleware, (req, res) => {
  const file = db.prepare('SELECT id, original_name, chunk_count, status FROM knowledge_files WHERE id = ?').get(req.params.id);
  if (!file) return res.status(404).json({ error: 'Arquivo não encontrado' });
  res.json(file);
});

// Deletar arquivo de conhecimento
// Reprocessar arquivo com erro
app.post('/api/admin/knowledge/:id/reprocess', adminMiddleware, (req, res) => {
  const file = db.prepare('SELECT * FROM knowledge_files WHERE id = ?').get(req.params.id);
  if (!file) return res.status(404).json({ error: 'Arquivo não encontrado' });
  db.prepare("UPDATE knowledge_files SET status = 'processing', chunk_count = 0 WHERE id = ?").run(file.id);
  db.prepare('DELETE FROM knowledge_chunks WHERE file_id = ?').run(file.id);
  processFile(file.id).catch(e => console.error('Erro reprocess:', e.message));
  res.json({ success: true, message: 'Reprocessando...' });
});

// Reprocessar TODOS os arquivos com erro
app.post('/api/admin/knowledge/reprocess-errors', adminMiddleware, (req, res) => {
  const errorFiles = db.prepare("SELECT * FROM knowledge_files WHERE status = 'error'").all();
  errorFiles.forEach((file, i) => {
    db.prepare("UPDATE knowledge_files SET status = 'processing', chunk_count = 0 WHERE id = ?").run(file.id);
    db.prepare('DELETE FROM knowledge_chunks WHERE file_id = ?').run(file.id);
    setTimeout(() => processFile(file.id).catch(e => console.error('Erro reprocess:', e.message)), i * 3000);
  });
  res.json({ success: true, message: `${errorFiles.length} arquivos sendo reprocessados` });
});

app.delete('/api/admin/knowledge/:id', adminMiddleware, (req, res) => {
  const file = db.prepare('SELECT * FROM knowledge_files WHERE id = ?').get(req.params.id);
  if (!file) return res.status(404).json({ error: 'Arquivo não encontrado' });
  
  // Remove arquivo físico
  try { fs.unlinkSync(file.file_path); } catch {}
  
  // Remove chunks e embeddings
  db.prepare('DELETE FROM knowledge_chunks WHERE file_id = ?').run(req.params.id);
  db.prepare('DELETE FROM knowledge_files WHERE id = ?').run(req.params.id);
  
  res.json({ success: true });
});


// ─── INGESTÃO DOS ARQUIVOS EXISTENTES ─────────────────────────
// Endpoint especial para processar arquivos que já estão no servidor
app.post('/api/admin/knowledge/ingest-server-files', adminMiddleware, async (req, res) => {
  const { files } = req.body; // array de { path, name }
  if (!files || !Array.isArray(files)) return res.status(400).json({ error: 'Lista de arquivos inválida' });
  
  const results = [];
  for (const f of files) {
    if (!fs.existsSync(f.path)) {
      results.push({ name: f.name, error: 'Arquivo não encontrado' });
      continue;
    }
    
    // Verifica se já foi processado
    const existing = db.prepare('SELECT id FROM knowledge_files WHERE file_path = ?').get(f.path);
    if (existing) {
      results.push({ name: f.name, id: existing.id, status: 'já existe' });
      continue;
    }
    
    const stat = fs.statSync(f.path);
    const fileId = db.prepare(
      'INSERT INTO knowledge_files (filename, original_name, file_path, file_size, status) VALUES (?, ?, ?, ?, ?)'
    ).run(path.basename(f.path), f.name, f.path, stat.size, 'processing').lastInsertRowid;
    
    results.push({ name: f.name, id: fileId, status: 'queued' });
    
    // Processa em background com delay para não sobrecarregar
    setTimeout(() => {
      processFile(fileId).catch(e => console.error(`Erro ${f.name}:`, e.message));
    }, results.length * 2000);
  }
  
  res.json({ message: `${results.length} arquivos enfileirados para processamento`, results });
});


// ─── PERFIL DO USUÁRIO (MEMÓRIA) ─────────────────────────────

// Salvar/atualizar perfil
app.put('/api/profile', authMiddleware, (req, res) => {
  const { nome, area, cidade, estado, anos_experiencia, tom_preferido, oab, escritorio, especialidade_secundaria, bio } = req.body;
  const userId = req.user.id;
  const tomValido = ['descontraido', 'equilibrado', 'formal'].includes(tom_preferido) ? tom_preferido : 'equilibrado';
  db.prepare(`
    INSERT OR REPLACE INTO user_profiles
      (user_id, nome, area, cidade, estado, anos_experiencia, tom_preferido, oab, escritorio, especialidade_secundaria, bio, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
  `).run(
    userId,
    nome || null, area || null, cidade || null, estado || null,
    anos_experiencia || null, tomValido,
    oab || null, escritorio || null, especialidade_secundaria || null, bio || null
  );
  res.json({ success: true });
});

// Ler perfil
app.get('/api/profile', authMiddleware, (req, res) => {
  const profile = db.prepare('SELECT * FROM user_profiles WHERE user_id = ?').get(req.user.id);
  res.json(profile || {});
});

// ─── TEMPLATES SALVOS DO USUÁRIO ────────────────────────────

// Listar templates
app.get('/api/templates', authMiddleware, (req, res) => {
  const templates = db.prepare('SELECT * FROM user_templates WHERE user_id = ? ORDER BY created_at DESC').all(req.user.id);
  res.json(templates);
});

// Criar template
app.post('/api/templates', authMiddleware, (req, res) => {
  const { titulo, prompt } = req.body;
  if (!titulo || !prompt) return res.status(400).json({ error: 'titulo e prompt são obrigatórios' });
  const result = db.prepare('INSERT INTO user_templates (user_id, titulo, prompt) VALUES (?, ?, ?)').run(req.user.id, titulo.trim().substring(0, 100), prompt.trim());
  res.json({ success: true, id: result.lastInsertRowid });
});

// Apagar template
app.delete('/api/templates/:id', authMiddleware, (req, res) => {
  const tpl = db.prepare('SELECT * FROM user_templates WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
  if (!tpl) return res.status(404).json({ error: 'Template não encontrado' });
  db.prepare('DELETE FROM user_templates WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

// ─── TAG MANUAL DE CONVERSA ────────────────────────────
app.patch('/api/conversations/:id/tag', authMiddleware, (req, res) => {
  const { tag } = req.body;
  const conv = db.prepare('SELECT * FROM conversations WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
  if (!conv) return res.status(404).json({ error: 'Conversa não encontrada' });
  db.prepare('UPDATE conversations SET tags = ? WHERE id = ?').run(tag || null, req.params.id);
  res.json({ success: true });
});

// ─── RELATÓRIO MENSAL DO USUÁRIO ──────────────────────────
app.get('/api/user/relatorio-mensal', authMiddleware, (req, res) => {
  const userId = req.user.id;
  const agora = new Date();
  const mesAtual = `${agora.getFullYear()}-${String(agora.getMonth()+1).padStart(2,'0')}`;

  // Peças geradas = mensagens de assistant no mês
  const pecasGeradas = db.prepare(`
    SELECT COUNT(*) as c FROM messages m
    JOIN conversations c ON c.id = m.conversation_id
    WHERE c.user_id = ? AND m.role = 'assistant'
    AND strftime('%Y-%m', m.created_at) = ?
  `).get(userId, mesAtual)?.c || 0;

  // Dias ativos = dias distintos com mensagens do usuário no mês
  const diasAtivosRows = db.prepare(`
    SELECT DISTINCT date(m.created_at) as dia FROM messages m
    JOIN conversations c ON c.id = m.conversation_id
    WHERE c.user_id = ? AND m.role = 'user'
    AND strftime('%Y-%m', m.created_at) = ?
    ORDER BY dia
  `).all(userId, mesAtual);
  const diasAtivos = diasAtivosRows.length;

  // Streak (mesma lógica do CapiTreino: conta hoje OU ontem como início)
  const todosDias = db.prepare(`
    SELECT DISTINCT date(m.created_at) as dia FROM messages m
    JOIN conversations c ON c.id = m.conversation_id
    WHERE c.user_id = ? AND m.role = 'user'
    ORDER BY dia DESC
  `).all(userId).map(r => r.dia);
  let streak = 0;
  const hoje = new Date();
  const hojeStr = hoje.toISOString().substring(0,10);
  if (todosDias.length > 0) {
    const ontem = new Date(hoje);
    ontem.setDate(hoje.getDate() - 1);
    const ontemStr = ontem.toISOString().substring(0,10);
    const inicio = (todosDias[0] === hojeStr || todosDias[0] === ontemStr)
      ? new Date(todosDias[0]) : null;
    if (inicio) {
      for (let i = 0; i < todosDias.length; i++) {
        const esperado = new Date(inicio);
        esperado.setDate(inicio.getDate() - i);
        const esperadoStr = esperado.toISOString().substring(0,10);
        if (todosDias[i] === esperadoStr) streak++;
        else break;
      }
    }
  }

  // Áreas mais usadas: analisa títulos das conversas do mês
  const conversasMes = db.prepare(`
    SELECT title FROM conversations
    WHERE user_id = ? AND strftime('%Y-%m', updated_at) = ?
  `).all(userId, mesAtual);
  const areaCount = {};
  const areaPatterns = [
    { area: 'Petição', re: /petição|petic|inicial|contest|recurso|embargos|habeas|mandado|agravo/i },
    { area: 'Tese', re: /tese|teses|fundament|argumento/i },
    { area: 'Honorários', re: /honorário|honora|tabela oab|cobrar|valor/i },
    { area: 'Trabalhista', re: /trabalhist|trabalh|clt|demiss|rescis/i },
    { area: 'Família', re: /família|divor|alimento|guar|herança|invent/i },
    { area: 'Criminal', re: /criminal|crime|preso|réu|acusado|inquérito/i },
  ];
  conversasMes.forEach(c => {
    areaPatterns.forEach(({ area, re }) => {
      if (re.test(c.title || '')) areaCount[area] = (areaCount[area] || 0) + 1;
    });
  });
  const areasMaisUsadas = Object.entries(areaCount)
    .sort((a,b) => b[1]-a[1])
    .map(([area, count]) => ({ area, count }));

  res.json({ pecas_geradas: pecasGeradas, areas_mais_usadas: areasMaisUsadas, dias_ativos: diasAtivos, streak });
});

// ─── ANALYTICS ────────────────────────────────────────────────

// Registrar evento de chip clicado
app.post('/api/analytics/chip', authMiddleware, (req, res) => {
  const { chip_text, chip } = req.body;
  const chipValue = chip_text || chip || '';
  db.prepare('INSERT INTO message_analytics (user_id, message_type, chip_used) VALUES (?, ?, ?)')
    .run(req.user.id, 'chip', chipValue);
  res.json({ success: true });
});

// Stats de analytics para admin
app.get('/api/admin/analytics', adminMiddleware, (req, res) => {
  const topChips = db.prepare(`
    SELECT chip_used, COUNT(*) as count 
    FROM message_analytics 
    WHERE message_type = 'chip' AND chip_used != ''
    GROUP BY chip_used ORDER BY count DESC LIMIT 10
  `).all();

  const topQuestions = db.prepare(`
    SELECT content, COUNT(*) as count
    FROM messages 
    WHERE role = 'user'
    GROUP BY content 
    HAVING LENGTH(content) < 120
    ORDER BY count DESC LIMIT 10
  `).all();

  const msgPerDay = db.prepare(`
    SELECT date(created_at) as day, COUNT(*) as count
    FROM messages WHERE role = 'user'
    GROUP BY day ORDER BY day DESC LIMIT 30
  `).all();

  const topAreas = db.prepare(`
    SELECT area, COUNT(*) as count 
    FROM user_profiles 
    WHERE area IS NOT NULL AND area != ''
    GROUP BY area ORDER BY count DESC LIMIT 10
  `).all();

  res.json({ topChips, topQuestions, msgPerDay, topAreas });
});

// ─── NOTIFICAÇÕES ─────────────────────────────────────────────

// Listar notificações ativas (usuário)
app.get('/api/notifications', authMiddleware, (req, res) => {
  const notifs = db.prepare('SELECT id, title, body, created_at FROM notifications WHERE active = 1 ORDER BY created_at DESC LIMIT 5').all();
  res.json(notifs);
});

// Criar notificação (admin)
app.post('/api/admin/notifications', adminMiddleware, (req, res) => {
  const { title, body } = req.body;
  if (!title || !body) return res.status(400).json({ error: 'Título e corpo obrigatórios' });
  const result = db.prepare('INSERT INTO notifications (title, body) VALUES (?, ?)').run(title, body);
  res.json({ id: result.lastInsertRowid, title, body, active: 1 });
});

// Desativar notificação (admin)
app.delete('/api/admin/notifications/:id', adminMiddleware, (req, res) => {
  db.prepare('UPDATE notifications SET active = 0 WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

// Listar notificações (admin)
app.get('/api/admin/notifications', adminMiddleware, (req, res) => {
  const notifs = db.prepare('SELECT * FROM notifications ORDER BY created_at DESC').all();
  res.json(notifs);
});

// Broadcast para todos os usuários
app.post('/api/admin/broadcast', adminMiddleware, (req, res) => {
  const { title, message } = req.body;
  if (!title || !message) return res.status(400).json({ error: 'Título e mensagem obrigatórios' });
  const activeUsers = db.prepare('SELECT COUNT(*) as c FROM users WHERE active = 1').get().c;
  db.prepare('INSERT INTO notifications (title, body, active) VALUES (?, ?, 1)').run(title, message);
  res.json({ success: true, sent_to: activeUsers });
});

// Ver mensagens de uma conversa específica (admin)
// Export em massa para análise
// Export endpoint removido (usado apenas para curadoria do fine-tuning)

app.get('/api/admin/conversations/:id/messages', adminMiddleware, (req, res) => {
  const conv = db.prepare('SELECT c.*, u.name as user_name, u.email as user_email FROM conversations c JOIN users u ON u.id = c.user_id WHERE c.id = ?').get(req.params.id);
  if (!conv) return res.status(404).json({ error: 'Conversa não encontrada' });
  const messages = db.prepare('SELECT role, content, created_at FROM messages WHERE conversation_id = ? ORDER BY id ASC').all(req.params.id);
  res.json({ conversation: conv, messages });
});

// ─── UPLOAD NA CONVERSA ───────────────────────────────────────

const uploadConv = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => cb(null, UPLOADS_DIR),
    filename: (req, file, cb) => {
      const safe = file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_');
      cb(null, 'conv_' + Date.now() + '_' + safe);
    }
  }),
  limits: { fileSize: 50 * 1024 * 1024 }, // 50MB
  fileFilter: (req, file, cb) => {
    const allowed = ['.txt', '.pdf', '.md', '.docx', '.jpg', '.jpeg', '.png', '.webp'];
    const ext = require('path').extname(file.originalname).toLowerCase();
    allowed.includes(ext) ? cb(null, true) : cb(new Error('Formato não suportado. Use PDF, DOCX, TXT ou imagem (JPG/PNG).'));
  }
});

// Helper: extrai texto de PDF — tenta texto nativo, fallback para Vision OCR
async function extractPdfText(filePath) {
  // Tenta extração de texto nativo primeiro
  try {
    const { PDFParse } = require('pdf-parse');
    const buf = fs.readFileSync(filePath);
    const parser = new PDFParse(new Uint8Array(buf));
    const data = await parser.getText();
    const text = (data.text || '').trim();
    // Se extraiu texto suficiente, retorna
    if (text.length > 100) return { text, method: 'native' };
  } catch(e) { /* fallback para OCR */ }

  // PDF escaneado — converte primeira(s) página(s) para imagem e usa Vision
  try {
    const { execSync } = require('child_process');
    const os = require('os');
    const tmpDir = fs.mkdtempSync(require('path').join(os.tmpdir(), 'pdf_ocr_'));
    // Converte até 10 páginas em imagem (resolução 150dpi para equilibrar qualidade/tamanho)
    execSync(`pdftoppm -r 150 -l 10 -png "${filePath}" "${tmpDir}/page"`, { timeout: 60000 });
    const pages = fs.readdirSync(tmpDir).filter(f => f.endsWith('.png')).sort();
    if (pages.length === 0) throw new Error('Nenhuma página convertida');

    // Envia cada página para Vision e concatena
    let fullText = '';
    for (const page of pages) {
      const imageBase64 = fs.readFileSync(require('path').join(tmpDir, page)).toString('base64');
      const visionResp = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${OPENAI_API_KEY}` },
        body: JSON.stringify({
          model: 'gpt-4.1',
          messages: [{ role: 'user', content: [
            { type: 'text', text: 'Transcreva integralmente todo o texto deste documento jurídico. Mantenha a estrutura original, incluindo cabeçalhos, parágrafos, numerações e dados. Não omita nenhuma parte.' },
            { type: 'image_url', image_url: { url: `data:image/png;base64,${imageBase64}` } }
          ]}],
          max_tokens: 8000,
          store: false
        })
      });
      const vd = await visionResp.json();
      fullText += (vd.choices?.[0]?.message?.content || '') + '\n\n';
    }
    // Limpa tmp
    try { execSync(`rm -rf "${tmpDir}"`); } catch(e) {}
    return { text: fullText.trim(), method: 'ocr' };
  } catch(e) {
    console.error('Erro OCR PDF:', e.message);
    return { text: '', method: 'error' };
  }
}

// Processa um arquivo e retorna o texto extraído
async function processUploadedFile(file) {
  try {
    const ext = require('path').extname(file.originalname).toLowerCase();
    const isImage = ['.jpg', '.jpeg', '.png', '.webp'].includes(ext);
    let extractedText = '';

    if (ext === '.txt' || ext === '.md') {
      extractedText = fs.readFileSync(file.path, 'utf8');
    } else if (ext === '.pdf') {
      const result = await extractPdfText(file.path);
      extractedText = result.text;
    } else if (ext === '.docx') {
      try {
        const mammoth = require('mammoth');
        const result = await mammoth.extractRawText({ path: file.path });
        extractedText = result.value;
      } catch(e) {
        extractedText = fs.readFileSync(file.path, 'utf8').replace(/[^\x20-\x7E\n\r\t\u00C0-\u024F]/g, ' ');
      }
    } else if (isImage) {
      const imageBase64 = fs.readFileSync(file.path).toString('base64');
      const mimeType = ext === '.png' ? 'image/png' : ext === '.webp' ? 'image/webp' : 'image/jpeg';
      const visionResp = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${OPENAI_API_KEY}` },
        body: JSON.stringify({
          model: 'gpt-4.1',
          messages: [{ role: 'user', content: [
            { type: 'text', text: 'Transcreva INTEGRALMENTE todo o texto desta imagem, sem omitir nenhuma parte. Se for um documento jurídico (petição, sentença, contrato, decisão, despacho), transcreva PALAVRA POR PALAVRA mantendo a estrutura original, cabeçalhos, numerações, parágrafos e dados. NÃO resuma. NÃO omita seções. Transcreva TUDO.' },
            { type: 'image_url', image_url: { url: `data:${mimeType};base64,${imageBase64}`, detail: 'high' } }
          ]}],
          max_tokens: 8000,
          store: false
        })
      });
      const visionData = await visionResp.json();
      extractedText = visionData.choices?.[0]?.message?.content || '';
    }

    let finalText = extractedText.substring(0, 100000);
    if (extractedText.length > 100000) {
      finalText = '[NOTA: O documento tem ' + Math.round(extractedText.length / 1000) + 'K caracteres. Exibindo os primeiros 100K caracteres.]\n\n' + finalText;
    }
    return finalText;
  } catch(e) {
    console.error('Erro ao processar arquivo:', file.originalname, e.message);
    return `[Erro ao extrair texto do arquivo ${file.originalname}. O arquivo foi recebido mas não foi possível ler o conteúdo automaticamente. Formato: ${require('path').extname(file.originalname)}]`;
  }
}

// Endpoint único — aceita 1 arquivo (mantém compatibilidade) ou múltiplos via 'files'
app.post('/api/conversation/upload', authMiddleware, uploadConv.array('file', 5), async (req, res) => {
  const files = req.files && req.files.length > 0 ? req.files : (req.file ? [req.file] : []);
  if (files.length === 0) return res.status(400).json({ error: 'Nenhum arquivo enviado' });

  try {
    const results = [];
    for (const file of files) {
      const extractedText = await processUploadedFile(file);
      const ext = require('path').extname(file.originalname).toLowerCase();
      // Conta páginas do PDF
      let pageCount = null;
      if (ext === '.pdf') {
        try {
          const { PDFParse } = require('pdf-parse');
          const buf = fs.readFileSync(file.path);
          const parser = new PDFParse(new Uint8Array(buf));
          const info = await parser.getText();
          pageCount = info.total || null;
        } catch(e) {}
      }
      const result = db.prepare(
        'INSERT INTO conversation_uploads (conversation_id, user_id, filename, original_name, file_path, size_bytes, page_count, extracted_text) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
      ).run(req.body.conversation_id || null, req.user.id, file.filename, file.originalname, file.path, file.size || 0, pageCount, extractedText);
      const fileSizeKB = Math.round(file.size / 1024);
      const fileSizeStr = fileSizeKB > 1024 ? (fileSizeKB / 1024).toFixed(1) + ' MB' : fileSizeKB + ' KB';
      results.push({
        upload_id: result.lastInsertRowid,
        id: result.lastInsertRowid,
        name: file.originalname,
        original_name: file.originalname,
        file_size: fileSizeStr,
        file_type: ext.replace('.', '').toUpperCase(),
        page_count: pageCount,
        extracted_length: extractedText.length,
        extracted_ok: extractedText.length > 50,
        preview: extractedText.substring(0, 300)
      });
    }
    // Retorna array de resultados (ou objeto único se foi 1 arquivo — compatibilidade)
    res.json(results.length === 1 ? results[0] : results);
  } catch (e) {
    console.error('Erro ao processar arquivo:', e);
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

// ─── UPLOAD DOCUMENT (alias compatível com /api/upload-document) ─────
app.post('/api/upload-document', authMiddleware, uploadConv.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Nenhum arquivo enviado' });
  try {
    const file = req.file;
    const extractedText = await processUploadedFile(file);
    const ext = path.extname(file.originalname).toLowerCase();
    let pageCount = null;
    if (ext === '.pdf') {
      try {
        const { PDFParse } = require('pdf-parse');
        const buf = fs.readFileSync(file.path);
        const parser = new PDFParse(new Uint8Array(buf));
        const info = await parser.getText();
        pageCount = info.total || null;
      } catch(e) {}
    }
    const result = db.prepare(
      'INSERT INTO conversation_uploads (conversation_id, user_id, filename, original_name, file_path, size_bytes, page_count, extracted_text) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
    ).run(req.body.conversation_id || null, req.user.id, file.filename, file.originalname, file.path, file.size || 0, pageCount, extractedText);
    res.json({
      id: result.lastInsertRowid,
      filename: file.originalname,
      page_count: pageCount,
      text_preview: extractedText.substring(0, 500)
    });
  } catch (e) {
    console.error('Erro ao processar documento:', e);
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

// ─── TRANSCRIÇÃO DE ÁUDIO (WHISPER) ─────────────────────────
const audioStorage = multer.diskStorage({
  destination: UPLOADS_DIR,
  filename: (req, file, cb) => cb(null, 'audio_' + Date.now() + path.extname(file.originalname))
});
const uploadAudio = multer({
  storage: audioStorage,
  limits: { fileSize: 25 * 1024 * 1024 }, // 25MB limite Whisper
  fileFilter: (req, file, cb) => {
    const allowed = ['.webm', '.mp3', '.mp4', '.wav', '.ogg', '.m4a', '.flac'];
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowed.includes(ext) || file.mimetype.startsWith('audio/') || file.mimetype.startsWith('video/')) cb(null, true);
    else cb(new Error('Formato de áudio não suportado'));
  }
});

app.post('/api/transcribe', authMiddleware, uploadAudio.single('audio'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Nenhum áudio enviado' });
  try {
    const FormData = require('form-data');
    const fs = require('fs');
    const form = new FormData();
    form.append('file', fs.createReadStream(req.file.path), {
      filename: req.file.originalname || 'audio.webm',
      contentType: req.file.mimetype || 'audio/webm'
    });
    form.append('model', 'whisper-1');
    form.append('language', 'pt');
    form.append('response_format', 'json');
    const axios = require('axios');
    const fileSizeBytes = req.file.size || 0;
    const response = await axios.post('https://api.openai.com/v1/audio/transcriptions', form, {
      headers: { ...form.getHeaders(), 'Authorization': 'Bearer ' + OPENAI_API_KEY },
      maxBodyLength: Infinity,
      timeout: 30000
    });
    // Limpar arquivo temporário
    fs.unlink(req.file.path, () => {});
    // Log uso Whisper — estimativa de duração a partir do tamanho do arquivo (~16KB/s para webm/opus)
    try {
      const estSeconds = Math.max(1, Math.round(fileSizeBytes / 16000));
      const estMinutes = estSeconds / 60;
      const whisperCost = estMinutes * 0.006;
      const transcribedText = response.data.text || '';
      const outTokens = Math.round(transcribedText.length / 3.5);
      logAiUsage(req.user.id, 'whisper_transcription', 'whisper-1', estSeconds, outTokens, 0, whisperCost);
    } catch(e) {}
    res.json({ text: response.data.text || '' });
  } catch (e) {
    console.error('Erro Whisper:', e.response?.data || e.message);
    // Tentar limpar arquivo mesmo em erro
    if (req.file) require('fs').unlink(req.file.path, () => {});
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

// ─── CHAT COM SUPORTE A DOCUMENTO ─────────────────────────────
// Extensão do /api/chat para aceitar upload_id
// (o upload_id é injetado no contexto como documento adicional)

// ─── FAVORITOS ───────────────────────────────────────────

app.post('/api/favorites', authMiddleware, (req, res) => {
  const { title, content } = req.body;
  if (!title || !content) return res.status(400).json({ error: 'Título e conteúdo obrigatórios' });
  const safeTitle = sanitizeInput(title);
  const safeContent = sanitizeInput(content);
  const result = db.prepare('INSERT INTO favorites (user_id, title, content) VALUES (?, ?, ?)').run(req.user.id, safeTitle, safeContent);
  res.json({ id: result.lastInsertRowid, title: safeTitle, content: safeContent });
});

app.get('/api/favorites', authMiddleware, (req, res) => {
  const favs = db.prepare('SELECT id, title, content, created_at FROM favorites WHERE user_id = ? ORDER BY created_at DESC').all(req.user.id);
  res.json(favs);
});

app.delete('/api/favorites/:id', authMiddleware, (req, res) => {
  const fav = db.prepare('SELECT * FROM favorites WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
  if (!fav) return res.status(404).json({ error: 'Favorito não encontrado' });
  db.prepare('DELETE FROM favorites WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

// ─── JOGO: SIMULADOR DE ATENDIMENTO ───────────────────────
app.post('/api/game/chat', authMiddleware, async (req, res) => {
  const { messages, level, area, client_temp } = req.body;
  if (!messages || !level || !area) return res.status(400).json({ error: 'Dados do jogo incompletos' });
  if (!OPENAI_API_KEY) return res.status(500).json({ error: 'API key não configurada' });

  const personalities = {
    'Fácil':  `Você é um cliente comum, curioso e receptivo, que tem um problema jurídico na área de ${area}. Está buscando um advogado pela primeira vez, nunca contratou nenhum antes. Tem 1-2 objeções simples (preço, tempo). É educado e aberto a ouvir.`,
    'Médio':  `Você é um cliente desconfiado, já gastou dinheiro com advogado que não entregou resultado na área de ${area}. Questiona honorários, pede garantias, compara preços. Tem 3-4 objeções e não aceita respostas vagas.`,
    'Difícil':`Você é um cliente agressivo e cético, foi enganado por advogados antes em casos de ${area}. Desconfia de tudo, diz que advocacia é tudo golpe, interrompe, ataca. Tem 5+ objeções pesadas e é extremamente difícil de convencer.`
  };
  // aceita level numérico (1/2/3) ou textual ('Fácil'/'Médio'/'Difícil')
  const levelMap = { 1: 'Fácil', '1': 'Fácil', 2: 'Médio', '2': 'Médio', 3: 'Difícil', '3': 'Difícil' };
  const levelKey = personalities[level] ? level : (levelMap[level] || 'Médio');

  const userName = req.user?.name || 'o advogado';

  const gameSystemPrompt = `Você é um CLIENTE (não um assistente) num jogo de simulação de atendimento jurídico.
Nível: ${levelKey} — Área: ${area}
O advogado que está te atendendo se chama ${userName}. Use o nome dele quando se referir ao advogado.

${personalities[levelKey]}

IMPORTANTE: Seu problema DEVE ser específico da área de ${area}. Não invente casos de outras áreas.

Regras:
1. NUNCA saia do personagem. Você é o CLIENTE, não o advogado.
2. A cada resposta, avalie internamente se o advogado foi bem (usou empatia, técnica, segurança) ou mal (foi genérico, prometeu demais, ficou na defensiva)
3. A temperatura atual do cliente é ${client_temp || 50}%. Ajuste baseado na qualidade da resposta do advogado (+5 a +15 se foi boa, -5 a -20 se foi ruim).
4. No final da sua resposta, adicione EXATAMENTE esta linha numa nova linha: [TEMP:XX] onde XX é a nova temperatura (0-100)
5. Se temp >= 90, adicione também na linha seguinte: [WIN]
6. Se temp <= 10, adicione na linha seguinte: [LOSE]
7. Seja realista — não deixe ganhar fácil, mas seja justo
8. Responda como cliente, com linguagem natural, faça objeções, perguntas, demonstre emoções.
9. Mantenha respostas curtas (2-4 parágrafos).`;

  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${OPENAI_API_KEY}` },
      body: JSON.stringify({
        model: 'gpt-4.1',
        messages: [{ role: 'system', content: gameSystemPrompt }, ...messages.slice(-20)],
        temperature: 0.8,
        max_tokens: 600,
        store: false,
        user: 'capi_user_' + req.user.id
      })
    });
    const data = await response.json();
    if (!response.ok) return res.status(502).json({ error: data.error?.message || 'Erro na OpenAI' });

    let reply = data.choices[0].message.content;

    // Parse temperatura e resultado
    const tempMatch = reply.match(/\[TEMP:(\d+)\]/);
    const newTemp = tempMatch ? parseInt(tempMatch[1]) : (client_temp || 50);
    const isWin = /\[WIN\]/.test(reply);
    const isLose = /\[LOSE\]/.test(reply);

    // Remove as tags do texto exibido
    reply = reply.replace(/\[TEMP:\d+\]/g, '').replace(/\[WIN\]/g, '').replace(/\[LOSE\]/g, '').trim();

    let result = 'continue';
    let feedback = '';
    if (isWin || newTemp >= 90) {
      result = 'win';
      feedback = 'Parabéns! Você fechou o contrato usando técnicas de atendimento eficazes!';
    } else if (isLose || newTemp <= 0) {
      result = 'lose';
      feedback = 'O cliente foi embora. Revise as técnicas dos 15 Passos do Atendimento do Rafael Cândia.';
    }

    res.json({ reply, new_temp: Math.max(0, Math.min(100, newTemp)), game_over: result !== 'continue', result, feedback });
  } catch (e) {
    console.error('Game error:', e);
    res.status(500).json({ error: 'Erro ao processar jogo' });
  }
});

// ─── MIGRATION: garantir colunas de plano para DBs antigos ─────
try {
  db.exec(`ALTER TABLE users ADD COLUMN plan_type TEXT DEFAULT 'free'`);
} catch(e) { /* coluna já existe */ }
try {
  db.exec(`ALTER TABLE users ADD COLUMN plan_expires_at TEXT`);
} catch(e) { /* coluna já existe */ }
try {
  db.exec(`ALTER TABLE users ADD COLUMN plan_activated_at TEXT`);
} catch(e) { /* coluna já existe */ }
try {
  db.exec(`ALTER TABLE users ADD COLUMN pagarme_subscription_id TEXT`);
} catch(e) { /* coluna já existe */ }
try {
  db.exec(`ALTER TABLE users ADD COLUMN reativacao_enviada TEXT`);
} catch(e) { /* coluna já existe */ }
try {
  db.exec(`ALTER TABLE users ADD COLUMN welcome_email_sent INTEGER DEFAULT 0`);
} catch(e) { /* coluna já existe */ }

// ─── MIGRATION: colunas extras de perfil do advogado ─────
try { db.prepare("ALTER TABLE user_profiles ADD COLUMN estado TEXT").run(); } catch(e) {}
try { db.prepare("ALTER TABLE user_profiles ADD COLUMN oab TEXT").run(); } catch(e) {}
try { db.prepare("ALTER TABLE user_profiles ADD COLUMN escritorio TEXT").run(); } catch(e) {}
try { db.prepare("ALTER TABLE user_profiles ADD COLUMN tom_preferido TEXT DEFAULT 'equilibrado'").run(); } catch(e) {}
try { db.prepare("ALTER TABLE user_profiles ADD COLUMN especialidade_secundaria TEXT").run(); } catch(e) {}
try { db.prepare("ALTER TABLE user_profiles ADD COLUMN bio TEXT").run(); } catch(e) {}

// ─── MIGRATION: campos premium upgrade ─────
try { db.exec(`ALTER TABLE users ADD COLUMN cancel_at_period_end INTEGER DEFAULT 0`); } catch(e) {}
try { db.exec(`ALTER TABLE users ADD COLUMN accepted_terms_at TEXT`); } catch(e) {}
// subscription_tier: 'standard' (R$47) ou 'pro' (R$97) — null = standard (legado)
try { db.exec(`ALTER TABLE users ADD COLUMN subscription_tier TEXT DEFAULT NULL`); } catch(e) {}
// is_founder: 1 = fundador (pagou R$47 antes de 17/04/2026), 0 = cliente novo
try { db.exec(`ALTER TABLE users ADD COLUMN is_founder INTEGER DEFAULT 0`); } catch(e) {}
// upgrade_cancel_pending: 1 = webhook não conseguiu cancelar mensal no upgrade, cron de reconcile deve pegar
try { db.exec(`ALTER TABLE users ADD COLUMN upgrade_cancel_pending INTEGER DEFAULT 0`); } catch(e) {}
// Backfill is_founder: todo paid+standard criado antes de 17/04/2026
try {
  const founderCutoff = '2026-04-17';
  const backfillResult = db.prepare(`
    UPDATE users
    SET is_founder = 1
    WHERE plan_type = 'paid'
      AND (subscription_tier = 'standard' OR subscription_tier IS NULL)
      AND created_at < ?
      AND is_founder = 0
  `).run(founderCutoff);
  if (backfillResult.changes > 0) console.log(`🏷️ Backfill is_founder: ${backfillResult.changes} users marcados como fundador`);
} catch(e) { console.error('Backfill is_founder:', e.message); }
// refund_on_upgrade: auditoria de estorno automático no upgrade mensal→anual
try { db.exec(`ALTER TABLE users ADD COLUMN refund_on_upgrade_cents INTEGER`); } catch(e) {}
try { db.exec(`ALTER TABLE users ADD COLUMN refund_on_upgrade_at TEXT`); } catch(e) {}

// ─── MIGRATION: campo tags em conversations ─────
try { db.prepare("ALTER TABLE conversations ADD COLUMN tags TEXT").run(); } catch(e) {}
// ─── TABELA: projetos ─────
db.exec(`
  CREATE TABLE IF NOT EXISTS projects (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    name TEXT NOT NULL,
    description TEXT DEFAULT '',
    icon TEXT DEFAULT '📁',
    context_note TEXT DEFAULT '',
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (user_id) REFERENCES users(id)
  );
`);

try { db.prepare("ALTER TABLE conversations ADD COLUMN project_id INTEGER").run(); } catch(e) {}

// ─── TABELA: templates salvos do usuário ─────
db.exec(`
  CREATE TABLE IF NOT EXISTS user_templates (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    titulo TEXT NOT NULL,
    prompt TEXT NOT NULL,
    created_at TEXT DEFAULT (datetime('now'))
  );
`);

// ─── HELPER: verificar se usuário tem acesso ativo ─────────────
function hasActiveAccess(user) {
  // Rafael e admin sempre têm acesso
  if (user.email === 'rafaelcandia.cj@gmail.com') return true;
  // Plano gift sem expiração
  if (user.plan_type === 'gift' && !user.plan_expires_at) return true;
  // Plano pago ou gift com data — verificar expiração
  if ((user.plan_type === 'paid' || user.plan_type === 'gift') && user.plan_expires_at) {
    return new Date(user.plan_expires_at) > new Date();
  }
  // Gratuito = sem acesso às features premium
  return user.plan_type === 'free' ? 'free' : false;
}

// Middleware que verifica plano — bloqueia se free e sem trial
function planMiddleware(req, res, next) {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'Token não fornecido' });
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(decoded.id);
    if (!user) return res.status(401).json({ error: 'Usuário não encontrado' });
    const access = hasActiveAccess(user);
    if (access === false) {
      return res.status(402).json({ error: 'Assinatura necessária', code: 'SUBSCRIPTION_REQUIRED', redirectTo: 'https://capicand-ia.com#planos' });
    }
    req.user = { ...decoded, plan_type: user.plan_type, plan_expires_at: user.plan_expires_at };
    next();
  } catch {
    res.status(401).json({ error: 'Token inválido ou expirado' });
  }
}

// ─── EMAIL BOAS-VINDAS ───────────────────────────────────────
const RESEND_API_KEY = process.env.RESEND_API_KEY || (() => { console.error('⚠️ SEGURANÇA: RESEND_API_KEY não configurado, usando fallback temporário'); return 're_6piw17L9_MAqNLdJkgAYKaXK5BzGn1QmG'; })();

async function sendEmail(to, subject, html) {
  const { Resend } = require('resend');
  const resend = new Resend(RESEND_API_KEY);
  const { error } = await resend.emails.send({
    from: 'Capi Când-IA Pro <noreply@capicand-ia.com>',
    to,
    subject,
    html
  });
  if (error) throw new Error(error.message);
}

async function sendWelcomeEmail(toEmail, toName) {
  try {
    const firstName = (toName || toEmail.split('@')[0]).split(' ')[0];

    // Gera token direto no email de boas-vindas para criar senha sem precisar de passos extras
    const token = require('crypto').randomBytes(32).toString('hex');
    const expiresAt = Date.now() + 7 * 24 * 3600000; // 7 dias
    db.prepare('INSERT OR REPLACE INTO reset_tokens (token, email, expires_at) VALUES (?, ?, ?)').run(token, toEmail.toLowerCase(), expiresAt);
    const createPasswordLink = `https://capicand-ia.com/app?reset=${token}`;

    const html = `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;background:#0a0a0a;color:#e8f5e9;padding:40px 32px;border-radius:12px">
      <div style="text-align:center;margin-bottom:32px">
        <h1 style="font-size:28px;color:#ffd700;margin:0">Capi Când-IA Pro</h1>
        <p style="color:#aaa;font-size:13px;margin-top:6px">A IA treinada com o método Cândia</p>
      </div>
      <p style="font-size:16px">Olá, <strong>${firstName}</strong>!</p>
      <p style="font-size:15px;line-height:1.7;color:#ccc">Sua compra foi confirmada! Seja bem-vindo(a) à <strong style="color:#ffd700">Capi Când-IA Pro</strong> — a IA treinada com 300+ teses jurídicas e todo o método Cândia.</p>
      <p style="font-size:15px;color:#ffd700;font-weight:bold">👇 Clique no botão abaixo para criar sua senha e já entrar na plataforma:</p>
      <div style="text-align:center;margin:32px 0">
        <a href="${createPasswordLink}" style="background:#ffd700;color:#000;padding:18px 48px;border-radius:8px;text-decoration:none;font-weight:bold;font-size:17px;display:inline-block">🔐 Criar minha senha e entrar</a>
      </div>
      <p style="font-size:13px;color:#666;text-align:center">Link válido por 7 dias. Se o botão não funcionar, copie e cole no navegador:<br><span style="color:#aaa">${createPasswordLink}</span></p>
      <div style="background:#1a1a1a;border:1px solid #333;border-radius:8px;padding:16px;margin:20px 0;text-align:center">
        <p style="margin:0 0 8px;font-size:13px;color:#aaa">Após criar sua senha, o endereço da plataforma é:</p>
        <a href="https://capicand-ia.com/app" style="color:#ffd700;font-size:16px;font-weight:bold;text-decoration:none">🔗 capicand-ia.com/app</a>
        <p style="margin:8px 0 0;font-size:12px;color:#666">Guarde este link! É por ele que você acessa a Capi em qualquer dispositivo.</p>
      </div>
      <hr style="border:none;border-top:1px solid #333;margin:24px 0">
      <p style="font-size:14px;color:#ccc"><strong style="color:#ffd700">O que você tem disponível:</strong></p>
      <ul style="color:#ccc;font-size:14px;line-height:2">
        <li>💬 Chat com 300+ teses jurídicas</li>
        <li>✍️ Monte seu Conteúdo</li>
        <li>📄 Revisor de Petição</li>
        <li>🎮 Simulador de Casos</li>
        <li>💰 Honorários por estado</li>
        <li>🎙️ Voz do Cândia</li>
      </ul>
      <hr style="border:none;border-top:1px solid #333;margin:24px 0">
      <p style="font-size:14px;color:#ccc">Bons estudos!<br><strong style="color:#ffd700">Rafael Cândia</strong></p>
    </div>`;

    await sendEmail(toEmail, '🎉 Acesso liberado! Crie sua senha — Capi Când-IA Pro', html);
    console.log('✅ Email boas-vindas (com link de criar senha) enviado para:', toEmail);
    // Marca email como enviado no banco
    try { db.prepare('UPDATE users SET welcome_email_sent = 1 WHERE email = ?').run(toEmail); } catch(e) {}
  } catch(e) {
    console.error('⚠️ Erro ao enviar email boas-vindas:', e.message);
  }
}

// ─── WEBHOOK PAGARME ─────────────────────────────────────────
const PAGARME_WEBHOOK_SECRET = process.env.PAGARME_WEBHOOK_SECRET || (() => { console.error('⚠️ SEGURANÇA: PAGARME_WEBHOOK_SECRET não configurado, usando fallback temporário'); return 'capi-pagarme-webhook-secret-2026'; })();

app.post('/api/webhook/pagarme', express.raw({ type: 'application/json' }), (req, res) => {
  try {
    // Verificar assinatura HMAC (se secret configurado)
    const sig = req.headers['x-hub-signature'] || req.headers['x-pagarme-signature'];
    if (PAGARME_WEBHOOK_SECRET && PAGARME_WEBHOOK_SECRET !== 'capi-pagarme-webhook-secret-2026') {
      const crypto = require('crypto');
      const rawBody = typeof req.body === 'string' ? req.body : (Buffer.isBuffer(req.body) ? req.body : JSON.stringify(req.body));
      const expectedSig = 'sha256=' + crypto.createHmac('sha256', PAGARME_WEBHOOK_SECRET).update(rawBody).digest('hex');
      if (!sig || !crypto.timingSafeEqual(Buffer.from(expectedSig), Buffer.from(sig))) {
        console.log('⚠️ Webhook PagarMe: assinatura inválida');
        return res.status(401).json({ error: 'Assinatura inválida' });
      }
    } else {
      console.warn('⚠️ PAGARME_WEBHOOK_SECRET não configurado — webhook NÃO verificado (CONFIGURAR EM PRODUÇÃO)');
    }
    let body;
    try { body = JSON.parse(req.body); } catch { body = req.body; }

    const { type, data } = body;
    console.log('📨 Webhook PagarMe:', type, JSON.stringify(data).substring(0, 200));

    if (!type || !data) return res.status(200).json({ ok: true });

    // Eventos que confirmam pagamento
    const PAID_EVENTS = [
      'subscription.created', 'subscription.activated',
      'charge.paid', 'order.paid',
      'payment.paid'
    ];

    if (PAID_EVENTS.includes(type)) {
      // Extrair email do customer
      const email = data?.customer?.email ||
                    data?.charges?.[0]?.customer?.email ||
                    data?.metadata?.email ||
                    data?.customer?.email_address;

      // Detectar plano: mensal ou anual
      const itemName = (data?.items?.[0]?.description || data?.plan?.name || '').toLowerCase();
      const isAnnual = itemName.includes('anual') || itemName.includes('annual') || itemName.includes('ano');
      const subscriptionId = data?.id || data?.subscription?.id || data?.charge?.id;

      // Detectar tier: pro (R$97/R$804) ou standard (R$47/R$397)
      // Prioridade: plan_id/item_id → fallback por valor da transação
      const pagarmeItemId = String(data?.items?.[0]?.id || data?.plan?.id || data?.subscription?.plan_id || '');
      const pagarmeAmount = parseInt(data?.amount || data?.charges?.[0]?.amount || data?.items?.[0]?.pricing_scheme?.price || 0); // centavos

      let pagarmeSubscriptionTier = 'standard';
      // Fallback por valor (PagarMe não tem offer_id como a Guru)
      // Faixas: R$97 mensal pro = 9700, R$397 anual standard = 39700, R$804 anual pro = 80400
      if (pagarmeAmount >= 80400) {
        pagarmeSubscriptionTier = 'pro';
      } else if (pagarmeAmount >= 9700 && pagarmeAmount < 39700) {
        pagarmeSubscriptionTier = 'pro';
      }

      if (email) {
        let user = db.prepare('SELECT * FROM users WHERE email = ?').get(email.toLowerCase());

        // Se usuário não existe ainda, criar automaticamente
        if (!user) {
          const tempPass = require('crypto').randomBytes(8).toString('hex');
          const hash = require('bcryptjs').hashSync(tempPass, 10);
          const customerName = data?.customer?.name || email.split('@')[0];
          try {
            db.prepare('INSERT INTO users (name, email, password) VALUES (?, ?, ?)').run(customerName, email.toLowerCase(), hash);
            user = db.prepare('SELECT * FROM users WHERE email = ?').get(email.toLowerCase());
            console.log('✅ Usuário criado via webhook:', email);
          } catch(e) {
            console.error('Erro ao criar usuário via webhook:', e.message);
          }
        }

        if (user) {
          const now = new Date();
          const expiresAt = new Date(now);
          if (isAnnual) {
            expiresAt.setFullYear(expiresAt.getFullYear() + 1);
          } else {
            expiresAt.setMonth(expiresAt.getMonth() + 1);
          }

          db.prepare(`
            UPDATE users SET
              plan_type = 'paid',
              plan_expires_at = ?,
              plan_activated_at = datetime('now'),
              pagarme_subscription_id = ?,
              subscription_tier = ?,
              active = 1
            WHERE id = ?
          `).run(expiresAt.toISOString(), subscriptionId || null, pagarmeSubscriptionTier, user.id);

          console.log(`✅ Plano ativado para ${email}: tier=${pagarmeSubscriptionTier}, ${isAnnual ? 'anual' : 'mensal'}, expira ${expiresAt.toISOString()}`);

          // Enviar email de boas-vindas em background
          setImmediate(() => sendWelcomeEmail(email, user.name));
        }
      }
    }

    // Eventos de cancelamento/inadimplência
    const CANCEL_EVENTS = ['subscription.canceled', 'subscription.deactivated', 'charge.refunded'];
    if (CANCEL_EVENTS.includes(type)) {
      const email = data?.customer?.email || data?.customer?.email_address;
      if (email) {
        db.prepare(`UPDATE users SET plan_type = 'free', plan_expires_at = NULL WHERE email = ?`).run(email.toLowerCase());
        console.log(`⚠️ Plano cancelado para ${email}`);
      }
    }

    res.status(200).json({ ok: true });
  } catch (e) {
    console.error('Webhook erro:', e.message);
    res.status(200).json({ ok: true }); // sempre retorna 200 para PagarMe não retentar
  }
});

// ─── GURU API: HELPERS PARA CANCELAMENTO E BUSCA ────────────
async function cancelGuruSubscription(subscriptionId, reason = 'Upgrade para Anual PRO') {
  try {
    const token = process.env.GURU_API_TOKEN;
    if (!token) {
      console.error('[cancelGuruSubscription] GURU_API_TOKEN não configurado');
      return { ok: false, error: 'GURU_API_TOKEN not set' };
    }
    const r = await fetch(`https://digitalmanager.guru/api/v2/subscriptions/${subscriptionId}/cancel`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        cancel_at_cycle_end: false,
        comment: reason
      })
    });
    const text = await r.text();
    if (!r.ok) {
      console.error(`[cancelGuruSubscription] FAILED ${subscriptionId}: ${r.status} ${text}`);
      return { ok: false, status: r.status, body: text };
    }
    console.log(`[cancelGuruSubscription] OK ${subscriptionId}`);
    return { ok: true, body: text };
  } catch (e) {
    console.error('[cancelGuruSubscription] EXCEPTION', e);
    return { ok: false, error: e.message };
  }
}

/**
 * Tenta estornar o último pagamento mensal se foi confirmado dentro de 7 dias.
 * Best-effort: nunca lança exceção, só loga e retorna resultado.
 * @param {string} oldMonthlySubId - UUID da assinatura mensal cancelada
 * @param {number} userId - ID do usuário no DB local (pra auditoria)
 * @returns {Promise<{refunded: boolean, reason: string}>}
 */
async function attemptRefundRecentMonthly(oldMonthlySubId, userId) {
  const GURU_API_TOKEN = process.env.GURU_API_TOKEN;
  try {
    // 1. Pegar a assinatura mensal pra extrair current_invoice
    const subResp = await fetch(
      `https://digitalmanager.guru/api/v2/subscriptions/${oldMonthlySubId}`,
      { headers: { Authorization: `Bearer ${GURU_API_TOKEN}`, Accept: 'application/json' } }
    );
    const sub = await subResp.json();

    const invoiceId = sub?.current_invoice?.id;
    if (!invoiceId) {
      console.log('[refund] sem current_invoice, pulando');
      return { refunded: false, reason: 'no_current_invoice' };
    }

    // 2. Buscar transação paga dessa invoice
    const txResp = await fetch(
      `https://digitalmanager.guru/api/v2/transactions?invoice_id=${invoiceId}`,
      { headers: { Authorization: `Bearer ${GURU_API_TOKEN}`, Accept: 'application/json' } }
    );
    const txData = await txResp.json();
    const paidTx = (txData?.data || []).find(t => t?.invoice?.status === 'paid');

    if (!paidTx) {
      console.log('[refund] nenhuma transação paga, pulando');
      return { refunded: false, reason: 'no_paid_transaction' };
    }

    // 3. Checar is_refundable (Guru marca false após refund — idempotência)
    if (paidTx.is_refundable === false) {
      console.log(`[refund] tx=${paidTx.id} já não é refundable, pulando`);
      return { refunded: false, reason: 'not_refundable' };
    }

    // 4. Checar janela de 7 dias via confirmed_at (unix seconds)
    const confirmedAt = paidTx.dates?.confirmed_at;
    if (!confirmedAt) {
      console.log('[refund] sem confirmed_at na transação, pulando');
      return { refunded: false, reason: 'no_confirmed_at' };
    }
    const nowSec = Math.floor(Date.now() / 1000);
    const daysSince = (nowSec - confirmedAt) / 86400;

    if (daysSince > 7) {
      console.log(`[refund] fora da janela (${daysSince.toFixed(1)}d), pulando`);
      return { refunded: false, reason: 'outside_7day_window' };
    }

    // 5. Emitir refund
    const refundResp = await fetch(
      `https://digitalmanager.guru/api/v2/transactions/${paidTx.id}/refund`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${GURU_API_TOKEN}`,
          Accept: 'application/json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          comment: 'Upgrade automático mensal→anual dentro de 7 dias — garantia de satisfação'
        }),
      }
    );
    const refundResult = await refundResp.json();
    console.log(`[refund] tx=${paidTx.id} status=${refundResp.status} result=`, refundResult);

    if (refundResp.ok) {
      // 6. Registrar auditoria no DB
      const valueCents = paidTx.value || paidTx.last_transaction?.value || 0;
      try {
        db.prepare(`UPDATE users SET refund_on_upgrade_cents = ?, refund_on_upgrade_at = datetime('now') WHERE id = ?`)
          .run(valueCents, userId);
        console.log(`[refund] auditoria salva: user=${userId} cents=${valueCents}`);
      } catch (dbErr) {
        console.error('[refund] erro ao salvar auditoria no DB:', dbErr.message);
      }
      return { refunded: true, reason: 'success', transactionId: paidTx.id, valueCents };
    }

    console.log(`[refund] API retornou ${refundResp.status}, não estornado`);
    return { refunded: false, reason: `api_error_${refundResp.status}` };
  } catch (err) {
    console.error('[refund] erro ao tentar estornar mensal antiga:', err);
    return { refunded: false, reason: 'exception' };
  }
}

async function findActiveMonthlySubscription(email) {
  const lowerEmail = (email || '').toLowerCase().trim();
  if (!lowerEmail) return null;

  try {
    const token = process.env.GURU_API_TOKEN;
    if (!token) {
      console.error('[findActiveMonthlySubscription] GURU_API_TOKEN não configurado');
      return null;
    }

    // Paginar TODAS as subs via cursor — API Guru não filtra email/status de forma confiável
    let cursor = null;
    const allSubs = [];
    for (let page = 0; page < 50; page++) {
      const url = new URL('https://digitalmanager.guru/api/v2/subscriptions');
      url.searchParams.set('limit', '100');
      if (cursor) url.searchParams.set('cursor', cursor);

      const r = await fetch(url.toString(), {
        headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
      });
      if (!r.ok) {
        console.error(`[findActiveMonthlySubscription] HTTP ${r.status} on page ${page} for ${email}`);
        break;
      }
      const d = await r.json();
      const data = d.data || [];
      if (!Array.isArray(data) || !data.length) break;
      allSubs.push(...data);
      cursor = d.next_cursor;
      if (!cursor) break;
    }

    console.log(`[findActiveMonthlySubscription] Fetched ${allSubs.length} total subs, filtering for ${lowerEmail}`);

    // Filtrar CLIENTE-SIDE: email match + active + produto mensal (R$47 ou R$97)
    const monthly = allSubs.find(s => {
      const contactEmail = (s.contact?.email || s.subscriber?.email || '').toLowerCase().trim();
      if (contactEmail !== lowerEmail) return false;
      if (s.last_status !== 'active') return false;
      // Deve ser mensal (charged_every_days <= 60)
      if (!s.charged_every_days || parseInt(s.charged_every_days) > 60) return false;
      // Aceita por nome do produto (contém "mensal") OU marketplace_id do produto mensal
      const pname = (s.product?.name || '').toLowerCase();
      const mid = String(s.product?.marketplace_id || s.product?.code || '');
      return pname.includes('mensal') || mid === '1773774908';
    });

    if (monthly) {
      console.log(`[findActiveMonthlySubscription] Found monthly sub ${monthly.id} for ${lowerEmail}`);
    } else {
      console.log(`[findActiveMonthlySubscription] No active monthly sub found for ${lowerEmail} (checked ${allSubs.length} subs)`);
    }
    return monthly || null;
  } catch (e) {
    console.error('[findActiveMonthlySubscription] error', e);
    return null;
  }
}

// Retry com backoff: tenta cancelar mensal 3x (0s, 3s, 6s)
async function cancelMonthlyWithRetry(email, userId) {
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const monthly = await findActiveMonthlySubscription(email);
      if (monthly) {
        const result = await cancelGuruSubscription(monthly.id, `Upgrade para anual - cancelamento automático (tentativa ${attempt})`);
        if (result.ok) {
          console.log(`[upgrade-cancel] user=${userId} sub=${monthly.id} cancelled on attempt ${attempt}`);
          return { cancelled: true, sub: monthly };
        }
        console.warn(`[upgrade-cancel] user=${userId} sub=${monthly.id} cancel API failed on attempt ${attempt}`);
      } else {
        console.log(`[upgrade-cancel] user=${userId} email=${email} no active monthly found on attempt ${attempt}`);
      }
    } catch (e) {
      console.error(`[upgrade-cancel] user=${userId} attempt ${attempt} exception:`, e.message);
    }
    if (attempt < 3) {
      await new Promise(r => setTimeout(r, attempt * 3000)); // 3s, 6s
    }
  }
  console.error(`[upgrade-cancel] user=${userId} email=${email} FAILED after 3 attempts — marking for reconcile`);
  // Gravar flag no DB para cron de reconciliação pegar depois
  try {
    db.prepare(`UPDATE users SET upgrade_cancel_pending = 1 WHERE id = ?`).run(userId);
  } catch (e) {
    console.error(`[upgrade-cancel] failed to set upgrade_cancel_pending for user=${userId}:`, e.message);
  }
  return { cancelled: false };
}

async function notifyRafael(subject, htmlBody) {
  try {
    await sendEmail('rafaelcandia.cj@gmail.com', subject, htmlBody);
    console.log(`[notifyRafael] Email sent: ${subject}`);
  } catch (e) {
    console.error(`[notifyRafael] Failed to send: ${subject}`, e.message);
  }
}

// ─── RECONCILE: Detecta e cancela mensais duplicadas para usuários pro ───
async function reconcileDuplicateSubscriptions() {
  console.log('[reconcile] Starting daily reconciliation...');
  const stats = { users_checked: 0, duplicates_found: 0, cancelled: 0, refunded: 0, errors: 0 };

  try {
    // Buscar TODOS os users com plan anual pro (subscription_tier=pro)
    // OU com flag upgrade_cancel_pending=1
    const proUsers = db.prepare(`
      SELECT id, email, name FROM users
      WHERE plan_type = 'paid'
        AND (subscription_tier = 'pro' OR upgrade_cancel_pending = 1)
    `).all();

    stats.users_checked = proUsers.length;
    console.log(`[reconcile] Checking ${proUsers.length} pro/pending users`);

    for (const user of proUsers) {
      try {
        const monthly = await findActiveMonthlySubscription(user.email);
        if (monthly) {
          stats.duplicates_found++;
          console.warn(`[reconcile] DUPLICATE: user=${user.id} (${user.email}) has active monthly sub ${monthly.id}`);

          // Cancelar a mensal
          const cancelResult = await cancelGuruSubscription(monthly.id, 'Reconcile: usuario ja tem anual ativo');
          if (cancelResult.ok) {
            stats.cancelled++;
            console.log(`[reconcile] Cancelled monthly ${monthly.id} for user=${user.id}`);

            // Tentar refund se ≤7 dias
            try {
              const refundResult = await attemptRefundRecentMonthly(monthly.id, user.id);
              if (refundResult.refunded) {
                stats.refunded++;
                console.log(`[reconcile] Refunded for user=${user.id}: tx=${refundResult.transactionId}`);
              }
            } catch (refErr) {
              console.error(`[reconcile] Refund error for user=${user.id}:`, refErr.message);
            }

            // Limpar flag de pending
            db.prepare(`UPDATE users SET upgrade_cancel_pending = 0 WHERE id = ?`).run(user.id);
          } else {
            stats.errors++;
            console.error(`[reconcile] Failed to cancel monthly ${monthly.id} for user=${user.id}`);
          }
        } else {
          // Sem mensal ativa — limpar flag se estava pendente
          db.prepare(`UPDATE users SET upgrade_cancel_pending = 0 WHERE id = ?`).run(user.id);
        }
      } catch (userErr) {
        stats.errors++;
        console.error(`[reconcile] Error processing user=${user.id}:`, userErr.message);
      }
    }
  } catch (e) {
    stats.errors++;
    console.error('[reconcile] Fatal error:', e.message);
  }

  console.log(`[reconcile] Done: checked=${stats.users_checked} duplicates=${stats.duplicates_found} cancelled=${stats.cancelled} refunded=${stats.refunded} errors=${stats.errors}`);
  return stats;
}

async function sendUpgradeWelcomeEmail(toEmail, toName) {
  try {
    const firstName = (toName || toEmail.split('@')[0]).split(' ')[0];
    const html = `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;background:#0a0a0a;color:#e8f5e9;padding:40px 32px;border-radius:12px">
      <div style="text-align:center;margin-bottom:32px">
        <h1 style="font-size:28px;color:#ffd700;margin:0">Capi Când-IA Pro</h1>
        <p style="color:#aaa;font-size:13px;margin-top:6px">A IA treinada com o método Cândia</p>
      </div>
      <p style="font-size:16px">Olá, <strong>${firstName}</strong>! 🎉</p>
      <p style="font-size:15px;line-height:1.7;color:#ccc">Seu plano foi atualizado para o <strong style="color:#ffd700">Anual PRO</strong>! Obrigado pela confiança em investir na sua advocacia com a Capi Când-IA Pro.</p>
      <div style="background:#1a1a1a;border:1px solid #333;border-radius:8px;padding:20px;margin:24px 0">
        <p style="color:#ffd700;font-weight:bold;margin:0 0 12px">O que muda no seu plano PRO:</p>
        <ul style="color:#ccc;font-size:14px;line-height:2;margin:0;padding-left:20px">
          <li>✅ Acesso completo por 12 meses</li>
          <li>✅ Modelos avançados de IA</li>
          <li>✅ Limites expandidos de uso diário</li>
          <li>✅ Todas as funcionalidades PRO desbloqueadas</li>
        </ul>
      </div>
      <div style="text-align:center;margin:32px 0">
        <a href="https://capicand-ia.com/app" style="background:#ffd700;color:#000;padding:18px 48px;border-radius:8px;text-decoration:none;font-weight:bold;font-size:17px;display:inline-block">Acessar a plataforma</a>
      </div>
      <hr style="border:none;border-top:1px solid #333;margin:24px 0">
      <p style="font-size:14px;color:#ccc">Bons estudos!<br><strong style="color:#ffd700">Rafael Cândia</strong></p>
    </div>`;
    await sendEmail(toEmail, `🎉 Plano atualizado pro Anual PRO, ${firstName}!`, html);
    console.log(`[sendUpgradeWelcomeEmail] Sent to ${toEmail}`);
  } catch (e) {
    console.error('[sendUpgradeWelcomeEmail] Error:', e.message);
  }
}

// ─── WEBHOOK GURU (Digital Manager Guru) ───────────────────
// Formato diferente do PagarMe — campos: subscriber.email, last_status, product.offer.name, charged_every_days
// Códigos dos produtos da IA no Guru — APENAS estes disparam cadastro
// NOTA: Oferta R$47 (standard) e R$97 (pro) estão no MESMO produto (1773774908).
//       Oferta R$397 (standard) e R$804 (pro) estão no MESMO produto (1773783918).
//       Por isso NÃO dá pra diferenciar tier por product_id — usamos OFFER_ID.
const GURU_IA_PRODUCT_CODES = ['1773774908', '1773783918']; // Mensal e Anual (ambos contêm standard + pro)
// Offer IDs que identificam as ofertas PRO (R$97/mês e R$804/ano)
const GURU_OFFER_ID_MONTHLY_97 = process.env.GURU_OFFER_ID_MONTHLY_97 || '';
const GURU_OFFER_ID_ANNUAL_804 = process.env.GURU_OFFER_ID_ANNUAL_804 || '';
const GURU_PRO_OFFER_IDS = [GURU_OFFER_ID_MONTHLY_97, GURU_OFFER_ID_ANNUAL_804].filter(Boolean);
// Product IDs antigos (deprecated — mantidos pra compatibilidade, mas NÃO usados pra detectar tier)
const GURU_PRO_MONTHLY_CODE = process.env.GURU_PRODUCT_ID_MONTHLY_97 || '';
const GURU_PRO_ANNUAL_CODE = process.env.GURU_PRODUCT_ID_ANNUAL_97 || '';
const GURU_PRO_PRODUCT_CODES = [GURU_PRO_MONTHLY_CODE, GURU_PRO_ANNUAL_CODE].filter(Boolean);
const ALL_GURU_IA_PRODUCT_CODES = [...GURU_IA_PRODUCT_CODES, ...GURU_PRO_PRODUCT_CODES].filter(Boolean);

const GURU_WEBHOOK_TOKEN = process.env.GURU_WEBHOOK_TOKEN;

app.post('/api/webhook/guru', express.json(), async (req, res) => {
  try {
    // Verificar token de autenticação (se configurado)
    if (GURU_WEBHOOK_TOKEN) {
      const token = req.headers['x-guru-token'] || req.query.token;
      if (token !== GURU_WEBHOOK_TOKEN) {
        console.log('⚠️ Webhook Guru: token inválido');
        return res.status(401).json({ error: 'Token inválido' });
      }
    } else {
      console.warn('⚠️ GURU_WEBHOOK_TOKEN não configurado — webhook NÃO verificado (CONFIGURAR EM PRODUÇÃO)');
    }
    const body = req.body;
    console.log('📨 Webhook Guru:', body?.last_status, body?.subscriber?.email, '| produto:', body?.product?.code);

    // ── FILTRO DE PRODUTO: só processa se for a IA ──────────────
    const productCode = String(body?.product?.code || body?.product?.id || '');
    const productName = (body?.product?.name || body?.product?.offer?.name || '').toLowerCase();
    const isIAProduct = ALL_GURU_IA_PRODUCT_CODES.includes(productCode) ||
                        productName.includes('capi când') ||
                        productName.includes('capi cand') ||
                        productName.includes('capi-ia') ||
                        productName.includes('capi ia') ||
                        productName.includes('capi candia pro');

    if (!isIAProduct) {
      console.log(`⚠️ Webhook Guru ignorado — produto não é a IA (código: ${productCode}, nome: ${productName})`);
      return res.status(200).json({ ok: true, skipped: true });
    }

    // ── DETECTAR TIER: 'pro' (R$97/R$804) ou 'standard' (R$47/R$397) ──
    // PRIORIDADE: offer_id → fallback por valor da transação
    // NÃO usar product_id nem nome do produto (ambos compartilhados entre standard e pro)
    const offerId = String(body?.product?.offer?.id || body?.offer_id || body?.subscription?.plan?.id || '');
    const transactionValue = parseInt(body?.last_transaction?.value || body?.charges?.amount || body?.amount || 0); // em centavos

    let subscriptionTier = 'standard';
    let tierSource = 'default';

    // 1) Detecção por offer_id (fonte principal)
    if (GURU_PRO_OFFER_IDS.length > 0 && GURU_PRO_OFFER_IDS.includes(offerId)) {
      subscriptionTier = 'pro';
      tierSource = 'offer_id';
    }
    // 2) Fallback por valor da transação (rede de segurança)
    //    Faixas: R$97 mensal pro = 9700, R$397 anual standard = 39700, R$804 anual pro = 80400
    //    Lógica: >= 80400 → pro anual; entre 9700 e 39699 → pro mensal; 39700-80399 → standard anual
    else if (transactionValue >= 80400) { // R$804,00+ em centavos → pro anual
      subscriptionTier = 'pro';
      tierSource = 'value_fallback';
      console.warn(`⚠️ Guru: tier PRO detectado por VALOR (${transactionValue} centavos), não por offer_id. Verifique se GURU_OFFER_ID_ANNUAL_804 está configurado.`);
    } else if (transactionValue >= 9700 && transactionValue < 39700) { // R$97-R$396 → pro mensal
      subscriptionTier = 'pro';
      tierSource = 'value_fallback';
      console.warn(`⚠️ Guru: tier PRO detectado por VALOR (${transactionValue} centavos), não por offer_id. Verifique se GURU_OFFER_ID_MONTHLY_97 está configurado.`);
    }
    // 3) Demais → standard (R$47, R$397, ou qualquer oferta não-pro)

    console.log(`📋 Guru tier detectado: ${subscriptionTier} (source: ${tierSource}, offer_id: ${offerId}, valor: ${transactionValue}, produto: ${productCode})`);
    // ────────────────────────────────────────────────────────────

    // Eventos de ativação/pagamento
    const ACTIVE_STATUSES = ['active', 'ativa', 'paid', 'started'];
    const CANCEL_STATUSES = ['canceled', 'cancelada', 'cancelled', 'expired', 'expirada'];

    const status = (body?.last_status || '').toLowerCase();
    const email = (body?.subscriber?.email || body?.last_transaction?.contact?.email || '').toLowerCase();
    // Nome completo: tenta subscriber.name (campo pode vir como nome completo ou só primeiro)
    const rawName = body?.subscriber?.name || body?.last_transaction?.contact?.name || '';
    const firstName = body?.subscriber?.first_name || '';
    const lastName = body?.subscriber?.last_name || '';
    const customerName = rawName || (firstName && lastName ? firstName + ' ' + lastName : firstName || lastName || (email ? email.split('@')[0] : 'Assinante'));
    const subscriptionId = body?.id || body?.subscription_code;

    // Detectar se é anual pelo intervalo ou nome da oferta
    const offerName = (body?.product?.offer?.name || '').toLowerCase();
    const intervalType = (body?.product?.offer?.plan?.interval_type || '').toLowerCase();
    const interval = parseInt(body?.product?.offer?.plan?.interval || 1);
    const chargedEveryDays = parseInt(body?.charged_every_days || 0);
    const isAnnual = offerName.includes('anual') || offerName.includes('annual') ||
                     intervalType === 'year' || intervalType === 'years' ||
                     (intervalType === 'month' && interval >= 12) ||
                     chargedEveryDays >= 360;

    if (!email) {
      console.log('⚠️ Webhook Guru sem email — ignorando');
      return res.status(200).json({ ok: true });
    }

    if (ACTIVE_STATUSES.includes(status)) {
      let user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);

      // ── UPGRADE DETECTION: R$804 anual de email que já é paid ──
      const isAnnualProOffer = offerId === GURU_OFFER_ID_ANNUAL_804 || transactionValue >= 80400;
      if (isAnnualProOffer && user && user.plan_type === 'paid' && user.subscription_tier !== 'pro') {
        console.log(`[webhook] UPGRADE detected for ${email} (current tier: ${user.subscription_tier})`);

        // Idempotência: se já é pro, não processar de novo
        const alreadyPro = user.subscription_tier === 'pro';
        if (!alreadyPro) {
          // 1) Cancelar mensal antiga via API Guru COM RETRY (3 tentativas: 0s, 3s, 6s)
          const retryResult = await cancelMonthlyWithRetry(email, user.id);
          const monthlyToCancel = retryResult.sub || null;
          const cancelledOk = retryResult.cancelled;

          // 1.5) Refund automático se pagamento mensal foi ≤7 dias atrás
          let refundResult = { refunded: false, reason: 'no_monthly_found' };
          if (monthlyToCancel && cancelledOk) {
            refundResult = await attemptRefundRecentMonthly(monthlyToCancel.id, user.id);
            console.log(`[refund] upgrade refund result for ${email}:`, JSON.stringify(refundResult));
          }

          // 2) Atualizar tier pra pro no DB — usa subscriptionId do WEBHOOK (= anual)
          const expiresAt = new Date();
          expiresAt.setFullYear(expiresAt.getFullYear() + 1);
          db.prepare(`
            UPDATE users SET
              plan_type = 'paid',
              plan_expires_at = ?,
              plan_activated_at = datetime('now'),
              pagarme_subscription_id = ?,
              subscription_tier = 'pro',
              upgrade_cancel_pending = ?,
              active = 1
            WHERE id = ?
          `).run(expiresAt.toISOString(), subscriptionId || null, cancelledOk ? 0 : 1, user.id);
          console.log(`[webhook] Upgrade complete: ${email} → pro, sub_id=${subscriptionId}, expires ${expiresAt.toISOString()}, cancel_pending=${!cancelledOk}`);

          // 3) Notificar Rafael sobre o upgrade
          const upgradeNotifHtml = `<div style="font-family:Arial,sans-serif;padding:24px;background:#0a0a0a;color:#eee;border-radius:8px;max-width:500px">
            <h2 style="color:#ffd700;margin:0 0 16px">🎉 Upgrade automático!</h2>
            <p><strong>Aluno:</strong> ${customerName} (${email})</p>
            <p><strong>De:</strong> Mensal → <strong style="color:#ffd700">Anual PRO</strong></p>
            <p>${monthlyToCancel
              ? `<strong>Mensal cancelada:</strong> ${cancelledOk ? '✅ OK (com retry)' : '❌ FALHOU após 3 tentativas!'} (sub: ${monthlyToCancel.id})`
              : '<strong>⚠️ Mensal não encontrada na Guru</strong> — pode já estar cancelada, verificar.'}</p>
            ${!cancelledOk ? '<p style="color:#ff4444;font-weight:bold">⚠️ AÇÃO NECESSÁRIA: Cancelar a mensal manualmente ou aguardar cron de reconciliação (4h UTC)!</p>' : ''}
            <p><strong>Refund automático:</strong> ${refundResult.refunded
              ? `✅ Estornado (tx: ${refundResult.transactionId}, R$${((refundResult.valueCents || 0) / 100).toFixed(2)})`
              : `⏭️ Não estornado (${refundResult.reason})`}</p>
            <p><strong>Hora:</strong> ${new Date().toLocaleString('pt-BR',{timeZone:'America/Campo_Grande'})}</p>
          </div>`;
          await notifyRafael(
            monthlyToCancel && cancelledOk
              ? `🎉 Upgrade automático: ${email}`
              : `⚠️ Upgrade ${email} — verificar cancelamento mensal`,
            upgradeNotifHtml
          );

          // 4) Enviar email de upgrade (não welcome novo)
          await sendUpgradeWelcomeEmail(email, user.name);
        }

        return res.status(200).json({ ok: true, action: 'upgrade' });
      }

      // ── FLUXO NORMAL: compra nova ──────────────────────────────
      // Criar usuário se não existir
      if (!user) {
        const tempPass = require('crypto').randomBytes(8).toString('hex');
        const hash = require('bcryptjs').hashSync(tempPass, 10);
        try {
          db.prepare('INSERT INTO users (name, email, password) VALUES (?, ?, ?)').run(customerName, email, hash);
          user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
          console.log('✅ Usuário criado via webhook Guru:', email);
        } catch(e) {
          console.error('Erro ao criar usuário via webhook Guru:', e.message);
        }
      }

      if (user) {
        const expiresAt = new Date();
        if (isAnnual) {
          expiresAt.setFullYear(expiresAt.getFullYear() + 1);
        } else {
          expiresAt.setMonth(expiresAt.getMonth() + 1);
        }

        db.prepare(`
          UPDATE users SET
            plan_type = 'paid',
            plan_expires_at = ?,
            plan_activated_at = datetime('now'),
            pagarme_subscription_id = ?,
            subscription_tier = ?,
            active = 1
          WHERE id = ?
        `).run(expiresAt.toISOString(), subscriptionId || null, subscriptionTier, user.id);

        console.log(`✅ Guru: plano ativado para ${email}: tier=${subscriptionTier}, ${isAnnual ? 'anual' : 'mensal'}, expira ${expiresAt.toISOString()}`);

        // 🎉 Notifica Rafael a cada nova venda — usa valor REAL do webhook quando disponível
        const valorReais = transactionValue > 0 ? (transactionValue / 100).toFixed(2).replace('.', ',') : null;
        const planoLabel = subscriptionTier === 'pro'
          ? (isAnnual ? `PRO Anual — R$ ${valorReais || '804'}` : `PRO Mensal — R$ ${valorReais || '97'}`)
          : (isAnnual ? `Anual — R$ ${valorReais || '397'}` : `Mensal — R$ ${valorReais || '47'}`);
        const tierBadge = subscriptionTier === 'pro' ? ' <span style="background:#ff6b00;color:#fff;padding:2px 8px;border-radius:4px;font-size:12px;font-weight:bold">PRO</span>' : '';
        const notifHtml = `<div style="font-family:Arial,sans-serif;padding:24px;background:#0a0a0a;color:#eee;border-radius:8px;max-width:500px">
          <h2 style="color:#ffd700;margin:0 0 16px">🎉 Nova venda! Capi Când-IA Pro${tierBadge}</h2>
          <p><strong>Nome:</strong> ${customerName}</p>
          <p><strong>Email:</strong> ${email}</p>
          <p><strong>Plano:</strong> ${planoLabel}</p>
          <p><strong>Tier:</strong> ${subscriptionTier === 'pro' ? 'PRO' : 'Standard'} (detectado via ${tierSource})</p>
          <p><strong>Hora:</strong> ${new Date().toLocaleString('pt-BR',{timeZone:'America/Campo_Grande'})}</p>
        </div>`;
        sendEmail('rafaelcandia.cj@gmail.com', `🎉 +1 assinante! ${customerName} — ${planoLabel}`, notifHtml).catch(e => {});
        setImmediate(() => sendWelcomeEmail(email, user.name));
      }
    }

    if (CANCEL_STATUSES.includes(status)) {
      // Guard: don't downgrade a user who just upgraded to annual PRO.
      // When we cancel the old monthly via Guru API, Guru sends a cancel webhook
      // back for that monthly. Without this guard, it would reset the user to free.
      const cancelTarget = db.prepare('SELECT plan_type, subscription_tier, plan_expires_at FROM users WHERE email = ?').get(email);
      if (cancelTarget && cancelTarget.subscription_tier === 'pro' && cancelTarget.plan_expires_at) {
        const expiresDate = new Date(cancelTarget.plan_expires_at);
        if (expiresDate > new Date()) {
          console.log(`⚠️ Guru cancel webhook for ${email} IGNORED — user is PRO with valid annual plan (expires ${cancelTarget.plan_expires_at}). This cancel is likely from the old monthly being cancelled during upgrade.`);
          return res.status(200).json({ ok: true, skipped_cancel: true });
        }
      }
      db.prepare(`UPDATE users SET plan_type = 'free', plan_expires_at = NULL WHERE email = ?`).run(email);
      console.log(`❌ Guru: plano cancelado para ${email}`);
    }

    res.status(200).json({ ok: true });
  } catch (e) {
    console.error('Webhook Guru erro:', e.message);
    res.status(200).json({ ok: true }); // sempre 200 para Guru não retentar
  }
});

// ─── ROTA: Status do plano do usuário ───────────────────────
app.get('/api/subscription/status', authMiddleware, (req, res) => {
  const user = db.prepare('SELECT plan_type, plan_expires_at, plan_activated_at, pagarme_subscription_id, subscription_tier, is_founder FROM users WHERE id = ?').get(req.user.id);
  if (!user) return res.status(404).json({ error: 'Usuário não encontrado' });
  const access = hasActiveAccess({ ...user, email: req.user.email });
  // Calcular days_remaining
  let days_remaining = null;
  if (user.plan_expires_at) {
    const now = new Date();
    const exp = new Date(user.plan_expires_at);
    days_remaining = Math.ceil((exp - now) / (1000 * 60 * 60 * 24));
  }
  const isAdmin = req.user.email === 'rafaelcandia.cj@gmail.com';
  const hasAutoRenewal = !!(user.pagarme_subscription_id && user.pagarme_subscription_id.startsWith('sub_'));
  const userCheckoutMonthly = user.is_founder ? CHECKOUT_MONTHLY_FUNDADOR : CHECKOUT_MONTHLY_NOVO;
  res.json({
    plan_type: user.plan_type || 'free',
    subscription_tier: user.subscription_tier || 'standard',
    plan_expires_at: user.plan_expires_at,
    plan_activated_at: user.plan_activated_at,
    has_access: access !== false,
    is_active: access === true || access === 'free',
    is_admin: isAdmin,
    is_founder: !!user.is_founder,
    has_auto_renewal: hasAutoRenewal,
    days_remaining: days_remaining,
    checkout_url: userCheckoutMonthly,
    checkout_annual_url: CHECKOUT_ANNUAL_NOVO,
    redirect_url: access === false ? 'https://capicand-ia.com#planos' : null
  });
});

// ─── ROTA: Upgrade para Anual PRO (retorna checkout URL) ─────
app.post('/api/subscription/upgrade-to-annual', authMiddleware, (req, res) => {
  try {
    const user = db.prepare('SELECT email, plan_type, subscription_tier FROM users WHERE id = ?').get(req.user.id);
    if (!user) return res.status(404).json({ error: 'Usuário não encontrado' });
    if (user.plan_type !== 'paid') return res.status(400).json({ error: 'Apenas assinantes pagantes podem fazer upgrade' });
    if (user.subscription_tier === 'pro') return res.status(400).json({ error: 'Você já é PRO' });
    const checkoutUrl = `https://clkdmg.site/subscribe/anual-capi-candia-pro-804?email=${encodeURIComponent(user.email)}`;
    console.log(`[upgrade-to-annual] ${user.email} → checkout URL generated`);
    res.json({ checkout_url: checkoutUrl });
  } catch (e) {
    console.error('[upgrade-to-annual] Error:', e.message);
    res.status(500).json({ error: 'Erro interno' });
  }
});

// ─── ADMIN: Backfill subscription_tier + fix Anderson ────────
app.post('/api/admin/backfill-tier', adminMiddleware, async (req, res) => {
  try {
    console.log('[backfill-tier] Starting backfill via admin endpoint');
    const { run } = require('./scripts/backfill_subscription_tier');
    const results = await run(db);
    console.log('[backfill-tier] Results:', JSON.stringify(results));
    res.json({ ok: true, results });
  } catch (e) {
    console.error('[backfill-tier] Error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// ─── ADMIN: Backfill is_founder (idempotente) ────────────────
app.post('/api/admin/backfill-founders', adminMiddleware, (req, res) => {
  try {
    const founderCutoff = '2026-04-17';

    // 1. Marcar fundadores: paid + standard + criado antes do cutoff
    const marked = db.prepare(`
      UPDATE users
      SET is_founder = 1
      WHERE plan_type = 'paid'
        AND (subscription_tier = 'standard' OR subscription_tier IS NULL)
        AND created_at < ?
        AND is_founder = 0
    `).run(founderCutoff);

    // 2. Garantir Anderson = is_founder 0 (virou PRO hoje, não é fundador)
    const anderson = db.prepare(`
      UPDATE users SET is_founder = 0
      WHERE email = 'andersontabosa.adv@gmail.com' AND is_founder != 0
    `).run();

    // 3. Remover status de quem já expirou há 3+ dias
    const expired = db.prepare(`
      UPDATE users
      SET is_founder = 0
      WHERE is_founder = 1
        AND plan_expires_at < datetime('now', '-3 days')
    `).run();

    // 4. Buscar stats
    const founders = db.prepare(`SELECT COUNT(*) as count FROM users WHERE is_founder = 1`).get();
    const andersonCheck = db.prepare(`SELECT id, email, is_founder, subscription_tier FROM users WHERE email = 'andersontabosa.adv@gmail.com'`).get();
    const allUsers = db.prepare(`SELECT id, name, email, is_founder, subscription_tier, plan_type, plan_expires_at, created_at FROM users WHERE plan_type = 'paid' ORDER BY is_founder DESC, created_at ASC`).all();

    console.log(`🏷️ Backfill founders: ${marked.changes} marcados, ${expired.changes} expirados removidos, total fundadores: ${founders.count}`);

    res.json({
      ok: true,
      results: {
        newly_marked_founders: marked.changes,
        expired_founders_removed: expired.changes,
        anderson_fixed: anderson.changes > 0,
        total_founders: founders.count,
        anderson: andersonCheck,
        users: allUsers
      }
    });
  } catch(e) {
    console.error('[backfill-founders] Error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// ─── ADMIN: dar/revogar acesso manual ────────────────────────
app.post('/api/admin/grant-access', adminMiddleware, (req, res) => {
  const { user_id, plan_type, months } = req.body;
  if (!user_id) return res.status(400).json({ error: 'user_id obrigatório' });

  const type = plan_type || 'gift';
  let expiresAt = null;

  if (months) {
    const d = new Date();
    d.setMonth(d.getMonth() + parseInt(months));
    expiresAt = d.toISOString();
  }

  db.prepare(`
    UPDATE users SET
      plan_type = ?,
      plan_expires_at = ?,
      plan_activated_at = datetime('now'),
      active = 1
    WHERE id = ?
  `).run(type, expiresAt, user_id);

  const user = db.prepare('SELECT id, name, email, plan_type, plan_expires_at FROM users WHERE id = ?').get(user_id);
  console.log(`🎁 Acesso manual concedido para ${user?.email}: ${type}${expiresAt ? ', expira ' + expiresAt : ' (permanente)'}`);
  res.json({ ok: true, user });
});

// Reenviar email de boas-vindas
// Envia email customizado para um destinatário específico
app.post('/api/admin/send-email', adminMiddleware, async (req, res) => {
  const { email, subject, html } = req.body;
  if (!email || !subject || !html) return res.status(400).json({ error: 'email, subject e html obrigatórios' });
  try {
    await sendEmail(email, subject, html);
    res.json({ ok: true, email });
  } catch(e) {
    console.error('Erro ao enviar email:', e);
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

app.post('/api/admin/resend-welcome', adminMiddleware, (req, res) => {
  const { user_id, email } = req.body;
  const user = user_id
    ? db.prepare('SELECT * FROM users WHERE id = ?').get(user_id)
    : db.prepare('SELECT * FROM users WHERE email = ?').get(email);
  if (!user) return res.status(404).json({ error: 'Usuário não encontrado' });
  setImmediate(() => sendWelcomeEmail(user.email, user.name));
  console.log(`📧 Reenvio de boas-vindas para: ${user.email}`);
  res.json({ ok: true, email: user.email });
});

app.post('/api/admin/revoke-access', adminMiddleware, (req, res) => {
  const { user_id } = req.body;
  if (!user_id) return res.status(400).json({ error: 'user_id obrigatório' });
  db.prepare(`UPDATE users SET plan_type = 'free', plan_expires_at = NULL WHERE id = ?`).run(user_id);
  res.json({ ok: true });
});

// ─── ADMIN: RECONCILE MANUAL DE DUPLICATAS ──────────────────
// POST /api/admin/reconcile-duplicates com x-admin-password: capiAdmin2026
app.post('/api/admin/reconcile-duplicates', async (req, res) => {
  const adminPass = req.headers['x-admin-password'];
  if (adminPass !== 'capiAdmin2026') {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  try {
    console.log('[reconcile-admin] Manual reconcile triggered');
    const stats = await reconcileDuplicateSubscriptions();
    res.json({ ok: true, ...stats });
  } catch (e) {
    console.error('[reconcile-admin] Error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// ─── PREMIUM UPGRADE: SUBSCRIPTION DETAILS ──────────────────
app.get('/api/subscription/details', authMiddleware, (req, res) => {
  try {
    const user = db.prepare('SELECT id, name, email, plan_type, plan_expires_at, plan_activated_at, pagarme_subscription_id, cancel_at_period_end, created_at, subscription_tier, is_founder FROM users WHERE id = ?').get(req.user.id);
    if (!user) return res.status(404).json({ error: 'Usuário não encontrado' });

    const planType = user.plan_type || 'free';
    const tier = user.subscription_tier || 'standard';
    const tierLabel = tier === 'pro' ? ' Pro' : '';
    let planName = 'Gratuito';
    if (planType === 'paid') {
      // Detectar se mensal ou anual baseado na diferença entre activated_at e expires_at
      if (user.plan_activated_at && user.plan_expires_at) {
        const diffDays = Math.round((new Date(user.plan_expires_at) - new Date(user.plan_activated_at)) / (1000*60*60*24));
        planName = (diffDays > 60 ? 'Anual' : 'Mensal') + tierLabel;
      } else {
        planName = 'Mensal' + tierLabel;
      }
    } else if (planType === 'gift') {
      planName = 'Presente';
    }

    let daysRemaining = null;
    if (user.plan_expires_at) {
      daysRemaining = Math.ceil((new Date(user.plan_expires_at) - new Date()) / (1000*60*60*24));
    }

    const hasAutoRenewal = !!(user.pagarme_subscription_id && user.pagarme_subscription_id.startsWith('sub_'));
    const detailsCheckoutMonthly = user.is_founder ? CHECKOUT_MONTHLY_FUNDADOR : CHECKOUT_MONTHLY_NOVO;

    // Contadores de uso
    const totalMessages = db.prepare("SELECT COUNT(*) as c FROM messages WHERE user_id = ? AND role = 'user'").get(user.id)?.c || 0;
    const totalConversations = db.prepare("SELECT COUNT(*) as c FROM conversations WHERE user_id = ?").get(user.id)?.c || 0;
    const totalPecas = db.prepare("SELECT COUNT(*) as c FROM pecas_salvas WHERE user_id = ?").get(user.id)?.c || 0;

    res.json({
      plan_type: planType,
      subscription_tier: tier,
      plan_name: planName,
      plan_expires_at: user.plan_expires_at,
      plan_activated_at: user.plan_activated_at,
      days_remaining: daysRemaining,
      has_auto_renewal: hasAutoRenewal,
      cancel_at_period_end: !!user.cancel_at_period_end,
      is_founder: !!user.is_founder,
      total_messages: totalMessages,
      total_conversations: totalConversations,
      total_pecas: totalPecas,
      member_since: user.created_at,
      checkout_url: detailsCheckoutMonthly,
      checkout_annual_url: CHECKOUT_ANNUAL_NOVO
    });
  } catch (e) {
    console.error('Erro subscription/details:', e.message);
    res.status(500).json({ error: 'Erro ao buscar dados da assinatura' });
  }
});

// ─── PREMIUM UPGRADE: CHANGE PASSWORD ───────────────────────
app.post('/api/auth/change-password', authMiddleware, async (req, res) => {
  try {
    const { current_password, new_password } = req.body;
    if (!current_password || !new_password) return res.status(400).json({ error: 'Preencha todos os campos' });
    if (new_password.length < 6) return res.status(400).json({ error: 'A nova senha deve ter no mínimo 6 caracteres' });

    const user = db.prepare('SELECT password FROM users WHERE id = ?').get(req.user.id);
    if (!user) return res.status(404).json({ error: 'Usuário não encontrado' });

    const valid = await bcrypt.compare(current_password, user.password);
    if (!valid) return res.status(401).json({ error: 'Senha atual incorreta' });

    const hash = await bcrypt.hash(new_password, 10);
    db.prepare('UPDATE users SET password = ? WHERE id = ?').run(hash, req.user.id);

    res.json({ success: true, message: 'Senha alterada com sucesso' });
  } catch (e) {
    console.error('Erro change-password:', e.message);
    res.status(500).json({ error: 'Erro ao alterar senha' });
  }
});

// ─── PREMIUM UPGRADE: CANCEL SUBSCRIPTION ───────────────────
app.post('/api/subscription/cancel', authMiddleware, async (req, res) => {
  try {
    const { reason } = req.body;
    const user = db.prepare('SELECT id, name, email, plan_type, plan_expires_at FROM users WHERE id = ?').get(req.user.id);
    if (!user) return res.status(404).json({ error: 'Usuário não encontrado' });
    if (user.plan_type === 'free') return res.status(400).json({ error: 'Você não possui uma assinatura ativa' });

    db.prepare('UPDATE users SET cancel_at_period_end = 1 WHERE id = ?').run(req.user.id);

    const expiresFormatted = user.plan_expires_at
      ? new Date(user.plan_expires_at).toLocaleDateString('pt-BR')
      : 'fim do ciclo atual';

    // Email para o usuário
    const userHtml = `
      <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;background:#0a0a0a;color:#e8e4de;padding:40px 32px;border-radius:12px">
        <h2 style="color:#b8860b;text-align:center">Cancelamento de Assinatura</h2>
        <p style="color:#ccc;font-size:15px;line-height:1.7">Olá, <strong>${(user.name || '').split(' ')[0] || 'Usuário'}</strong>.</p>
        <p style="color:#ccc;font-size:15px;line-height:1.7">Confirmamos o cancelamento da sua assinatura da <strong style="color:#b8860b">Capi Când-IA Pro</strong>.</p>
        <p style="color:#ccc;font-size:15px;line-height:1.7">Você continuará com acesso completo até <strong style="color:#fff">${expiresFormatted}</strong>.</p>
        <p style="color:#ccc;font-size:15px;line-height:1.7">Se mudar de ideia, basta renovar sua assinatura a qualquer momento.</p>
        <p style="font-size:12px;color:#555;text-align:center;margin-top:32px">Capi Când-IA Pro</p>
      </div>`;
    sendEmail(user.email, 'Confirmação de cancelamento — Capi Când-IA Pro', userHtml).catch(e => console.error('Erro email cancelamento user:', e.message));

    // Email para o admin
    const adminHtml = `
      <div style="font-family:Arial;padding:20px">
        <h3 style="color:#d32f2f">Cancelamento de assinatura</h3>
        <p><strong>${user.name}</strong> (${user.email}) solicitou cancelamento.</p>
        <p>Plano: ${user.plan_type} | Expira em: ${expiresFormatted}</p>
        ${reason ? `<p>Motivo: ${reason}</p>` : ''}
      </div>`;
    sendEmail('rafaelcandia.cj@gmail.com', `Cancelamento: ${user.name} (${user.email})`, adminHtml).catch(e => console.error('Erro email cancelamento admin:', e.message));

    res.json({ success: true, message: `Assinatura cancelada. Você terá acesso até ${expiresFormatted}.` });
  } catch (e) {
    console.error('Erro cancel subscription:', e.message);
    res.status(500).json({ error: 'Erro ao cancelar assinatura' });
  }
});

// ─── PREMIUM UPGRADE: DELETE ACCOUNT (LGPD art. 18) ─────────
app.delete('/api/account', authMiddleware, async (req, res) => {
  try {
    const { password } = req.body;
    if (!password) return res.status(400).json({ error: 'Senha obrigatória para confirmar exclusão' });

    const user = db.prepare('SELECT id, name, email, password FROM users WHERE id = ?').get(req.user.id);
    if (!user) return res.status(404).json({ error: 'Usuário não encontrado' });

    const valid = await bcrypt.compare(password, user.password);
    if (!valid) return res.status(401).json({ error: 'Senha incorreta' });

    // Deletar dados relacionados em ordem
    const userId = user.id;
    db.prepare('DELETE FROM messages WHERE user_id = ?').run(userId);
    db.prepare('DELETE FROM conversations WHERE user_id = ?').run(userId);
    try { db.prepare('DELETE FROM user_memory WHERE user_id = ?').run(userId); } catch(e) {}
    try { db.prepare('DELETE FROM favorites WHERE user_id = ?').run(userId); } catch(e) {}
    try { db.prepare('DELETE FROM notifications WHERE id IN (SELECT id FROM notifications)').run(); } catch(e) {}
    try { db.prepare('DELETE FROM user_profiles WHERE user_id = ?').run(userId); } catch(e) {}
    try { db.prepare('DELETE FROM pecas_salvas WHERE user_id = ?').run(userId); } catch(e) {}
    try { db.prepare('DELETE FROM message_analytics WHERE user_id = ?').run(userId); } catch(e) {}
    try { db.prepare('DELETE FROM conversation_uploads WHERE user_id = ?').run(userId); } catch(e) {}
    try { db.prepare('DELETE FROM ai_usage_log WHERE user_id = ?').run(userId); } catch(e) {}
    db.prepare('DELETE FROM users WHERE id = ?').run(userId);

    // Email de confirmação para o usuário
    const userHtml = `
      <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;background:#0a0a0a;color:#e8e4de;padding:40px 32px;border-radius:12px">
        <h2 style="color:#b8860b;text-align:center">Conta Excluída</h2>
        <p style="color:#ccc;font-size:15px;line-height:1.7">Olá, <strong>${(user.name || '').split(' ')[0] || 'Usuário'}</strong>.</p>
        <p style="color:#ccc;font-size:15px;line-height:1.7">Sua conta e todos os seus dados foram permanentemente excluídos da <strong style="color:#b8860b">Capi Când-IA Pro</strong>, conforme previsto na LGPD (art. 18).</p>
        <p style="color:#ccc;font-size:15px;line-height:1.7">Lamentamos vê-lo(a) partir. Se desejar voltar no futuro, será sempre bem-vindo(a).</p>
        <p style="font-size:12px;color:#555;text-align:center;margin-top:32px">Capi Când-IA Pro</p>
      </div>`;
    sendEmail(user.email, 'Confirmação de exclusão de conta — Capi Când-IA Pro', userHtml).catch(e => console.error('Erro email exclusão user:', e.message));

    // Email para admin
    const adminHtml = `
      <div style="font-family:Arial;padding:20px">
        <h3 style="color:#d32f2f">Conta excluída</h3>
        <p><strong>${user.name}</strong> (${user.email}) excluiu a conta permanentemente.</p>
        <p>ID: ${userId}</p>
      </div>`;
    sendEmail('rafaelcandia.cj@gmail.com', `Conta excluída: ${user.name} (${user.email})`, adminHtml).catch(e => console.error('Erro email exclusão admin:', e.message));

    res.json({ success: true, message: 'Conta excluída permanentemente' });
  } catch (e) {
    console.error('Erro delete account:', e.message);
    res.status(500).json({ error: 'Erro ao excluir conta' });
  }
});

// ─── CHECKOUT REDIRECT ──────────────────────────────────────
// Redireciona para PagarMe quando tiver a integração configurada
app.get('/checkout', (req, res) => {
  const plan = req.query.plan || 'monthly';
  // URLs atualizadas: R$97 mensal (novo) e R$804 anual (novo)
  const url = plan === 'annual' ? CHECKOUT_ANNUAL_NOVO : CHECKOUT_MONTHLY_NOVO;
  res.redirect(302, url);
});

// ── MINHAS PEÇAS (salvar/listar/carregar/deletar) ─────────────────────────────

// POST /api/pecas — salvar peça
app.post('/api/pecas', authMiddleware, (req, res) => {
  try {
    const { tipo_peca, descricao, secoes, alertas, plano_b, escolhas_estrategicas } = req.body;
    const result = db.prepare(
      'INSERT INTO pecas_salvas (user_id, tipo_peca, descricao, secoes, alertas, plano_b, escolhas_estrategicas) VALUES (?, ?, ?, ?, ?, ?, ?)'
    ).run(
      req.user.id,
      tipo_peca || null,
      descricao || null,
      secoes ? JSON.stringify(secoes) : null,
      alertas ? JSON.stringify(alertas) : null,
      plano_b || null,
      escolhas_estrategicas ? JSON.stringify(escolhas_estrategicas) : null
    );
    return res.json({ id: result.lastInsertRowid, message: 'Peça salva' });
  } catch (err) {
    console.error('Erro POST /api/pecas:', err);
    return res.status(500).json({ error: 'Erro ao salvar peça' });
  }
});

// GET /api/pecas — listar peças do usuário
app.get('/api/pecas', authMiddleware, (req, res) => {
  try {
    const rows = db.prepare('SELECT * FROM pecas_salvas WHERE user_id = ? ORDER BY created_at DESC').all(req.user.id);
    const pecas = rows.map(p => ({
      ...p,
      secoes: p.secoes ? JSON.parse(p.secoes) : [],
      alertas: p.alertas ? JSON.parse(p.alertas) : [],
      escolhas_estrategicas: p.escolhas_estrategicas ? JSON.parse(p.escolhas_estrategicas) : []
    }));
    return res.json({ pecas });
  } catch (err) {
    console.error('Erro GET /api/pecas:', err);
    return res.status(500).json({ error: 'Erro ao listar peças' });
  }
});

// GET /api/pecas/:id — carregar peça específica
app.get('/api/pecas/:id', authMiddleware, (req, res) => {
  try {
    const peca = db.prepare('SELECT * FROM pecas_salvas WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
    if (!peca) return res.status(404).json({ error: 'Peça não encontrada' });
    return res.json({
      ...peca,
      secoes: peca.secoes ? JSON.parse(peca.secoes) : [],
      alertas: peca.alertas ? JSON.parse(peca.alertas) : [],
      escolhas_estrategicas: peca.escolhas_estrategicas ? JSON.parse(peca.escolhas_estrategicas) : []
    });
  } catch (err) {
    console.error('Erro GET /api/pecas/:id:', err);
    return res.status(500).json({ error: 'Erro ao carregar peça' });
  }
});

// DELETE /api/pecas/:id — deletar peça
app.delete('/api/pecas/:id', authMiddleware, (req, res) => {
  try {
    const result = db.prepare('DELETE FROM pecas_salvas WHERE id = ? AND user_id = ?').run(req.params.id, req.user.id);
    if (result.changes === 0) return res.status(404).json({ error: 'Peça não encontrada ou sem permissão' });
    return res.json({ message: 'Peça deletada' });
  } catch (err) {
    console.error('Erro DELETE /api/pecas/:id:', err);
    return res.status(500).json({ error: 'Erro ao deletar peça' });
  }
});

// ── CALCULADORA DE HONORÁRIOS
// ─── EDITOR DE PEÇAS JURÍDICAS ───────────────────────────────

// POST /api/peca/gerar — gera peça jurídica completa em JSON com 5 seções
app.post('/api/peca/gerar', authMiddleware, async (req, res) => {
  try {
    const { descricao } = req.body;
    if (!descricao || !descricao.trim()) {
      return res.status(400).json({ error: 'descricao é obrigatória' });
    }

    // Busca perfil do usuário
    const profile = db.prepare('SELECT * FROM user_profiles WHERE user_id = ?').get(req.user.id);
    const nome = profile?.nome || 'Advogado(a)';
    const oab = profile?.oab || '[OAB]';
    const cidade = profile?.cidade || '[Cidade]';
    const estado = profile?.estado || '[Estado]';
    const area = profile?.area || '[Área]';
    const escritorio = profile?.escritorio || '[Escritório]';
    const anos_experiencia = profile?.anos_experiencia || '';

    const hoje = new Date();
    const dataFormatada = hoje.toLocaleDateString('pt-BR', {day:'2-digit', month:'long', year:'numeric'});

    const systemPrompt = `Você é o melhor advogado processualista do Brasil, reconhecido por produzir peças jurídicas densas, persuasivas e tecnicamente impecáveis. Sua missão é redigir uma peça jurídica COMPLETA, ENCORPADA, REAL e PRONTA PARA PROTOCOLAR.

FILOSOFIA: Cada peça que você produz é um "Projeto de Sentença" (Art. 489 CPC) — escrita para que o juiz copie seus argumentos direto na decisão. Use IRAC internamente (Issue, Rule, Application, Conclusion) sem jamais expor a metodologia.

REGRA CRÍTICA: USE OS FATOS DO ADVOGADO. Não use placeholders genéricos. EXTRAIA dados da descrição e escreva texto real. Colchetes APENAS para CPF, RG, endereço, nomes de partes não informados.

Retorne APENAS JSON válido neste formato:
{
  "tipo_peca": "Nome completo da ação (ex: Ação de Obrigação de Fazer c/c Indenização por Danos Morais e Materiais com Pedido de Tutela de Urgência)",
  "sections": [
    {
      "id": "enderecamento",
      "title": "Da Qualificação das Partes",
      "content": "Endereçamento ao juízo competente + qualificação completa do autor (com dados do perfil do advogado) + tipo da ação em CAIXA ALTA + qualificação do réu."
    },
    {
      "id": "fatos",
      "title": "Dos Fatos",
      "content": "OBRIGATÓRIO: MÍNIMO 7 PARÁGRAFOS LONGOS. Narre TODOS os fatos cronologicamente com riqueza de detalhes. Cada parágrafo deve ter 4-6 linhas. Inclua: (1) contexto da relação/compra, (2) o problema/dano ocorrido, (3) tentativas de resolução administrativa, (4) prazos decorridos, (5) prejuízos materiais sofridos, (6) impacto emocional/moral, (7) necessidade de tutela judicial. Escreva como se estivesse contando uma história ao juiz — persuasiva, detalhada e indignável."
    },
    {
      "id": "direito",
      "title": "Do Direito",
      "content": "OBRIGATÓRIO: MÍNIMO 8 PARÁGRAFOS COM SUBSEÇÕES TEMÁTICAS. Estruture assim:\n\nII.1. Da Relação Jurídica e sua Natureza (identifique a relação: consumo, contratual, etc.)\nII.2. Da Responsabilidade (objetiva/subjetiva, solidariedade entre réus)\nII.3. Do Direito Material Violado (artigos específicos: CC, CDC, CLT, CF etc.)\nII.4. Dos Danos Materiais (fundamente com art. 402 CC, demonstre prejuízo patrimonial)\nII.5. Dos Danos Morais (fundamente com jurisprudência, demonstre abalo extra-patrimonial)\nII.6. Da Inversão do Ônus da Prova (art. 6º, VIII, CDC quando aplicável)\nII.7. Da Tutela de Urgência (quando cabível: fumus boni iuris + periculum in mora)\n\nCada subseção deve ter 2-4 parágrafos com artigos de lei ESPECÍFICOS, súmulas PERTINENTES ao caso (não genéricas), e raciocínio silogístico: norma + fato = conclusão. CITE APENAS súmulas e jurisprudência que sejam REALMENTE pertinentes ao tipo de caso descrito. NÃO cite súmulas de áreas diferentes (ex: não cite súmula bancária num caso de consumidor)."
    },
    {
      "id": "pedidos",
      "title": "Dos Pedidos",
      "content": "OBRIGATÓRIO: MÍNIMO 10 PEDIDOS detalhados. Estruture como comandos decisórios prontos para o juiz copiar. Inclua OBRIGATORIAMENTE:\n(1) Tutela de urgência com prazo e multa diária\n(2) Pedido principal (obrigação de fazer/não fazer/pagar)\n(3) Pedido subsidiário/alternativo\n(4) Danos materiais com valor estimado\n(5) Danos morais com valor sugerido (proporcional ao caso)\n(6) Inversão do ônus da prova\n(7) Citação dos réus\n(8) Justiça gratuita\n(9) Correção monetária + juros de mora\n(10) Custas + honorários advocatícios\n(11) Produção de provas\n(12) Valor da causa calculado (soma dos pedidos)\nCada pedido deve ser ESPECÍFICO com valores em reais quando possível."
    },
    {
      "id": "fechamento",
      "title": "Do Encerramento e Requerimentos",
      "content": "Requerimentos finais adicionais + Termos em que, Pede deferimento. + Local, data e assinatura do advogado."
    }
  ],
  "alertas": ["alerta específico 1", "alerta 2", "alerta 3"],
  "plano_b": "Estratégia alternativa concreta para este caso específico",
  "escolhas_estrategicas": ["decisão estratégica 1", "decisão 2"]
}

REGRAS ABSOLUTAS:
1. PEÇA ENCORPADA: Advogado quer peça DENSA e ROBUSTA. Não economize texto. Cada seção deve ser substancial.
2. USE os fatos fornecidos: datas, valores, nomes, produtos, circunstâncias. NÃO ignore nada.
3. Linguagem forense formal, técnica e elegante.
4. PROIBIDO inventar jurisprudência. Se citar decisão específica, adicione "(confirme no JusBrasil antes de protocolar)".
5. CITE APENAS súmulas pertinentes ao tipo de caso. Não misture áreas (ex: súmula bancária em caso consumerista de produto).
6. Colchetes APENAS para: CPF, RG, endereço, nomes não informados.
7. Seção Fatos: MÍNIMO 7 parágrafos longos.
8. Seção Direito: MÍNIMO 8 parágrafos com subseções temáticas (II.1, II.2, etc.).
9. Seção Pedidos: MÍNIMO 10 pedidos específicos com valores.
10. SEMPRE inclua: tutela de urgência, inversão do ônus da prova, danos materiais separados dos morais, justiça gratuita.
11. JSON válido. Use \\n para quebras de linha.`;

    const userMessage = `DADOS DO ADVOGADO:
- Nome: ${nome}
- OAB: ${estado ? 'OAB/' + estado + ' ' : ''}${oab}
- Cidade/Estado: ${cidade}/${estado}
- Área de atuação: ${area}
- Escritório: ${escritorio}${anos_experiencia ? `\n- Anos de experiência: ${anos_experiencia}` : ''}
- Data de hoje: ${dataFormatada}

DESCRIÇÃO DO CASO (USE TODOS ESTES FATOS NA PEÇA):
${descricao.trim()}

IMPORTANTE: Escreva a peça COMPLETA usando os fatos acima. Não use placeholders para dados que estão na descrição. A peça deve sair pronta para revisar e protocolar.`;

    // ── GERAÇÃO: Gemini (primário, mais barato/rápido) com fallback OpenAI ──
    let raw = null;

    if (GEMINI_API_KEY) {
      console.log('✨ Gerando peça via Gemini 2.5 Flash...');
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 120000);
      try {
        const gemRes = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              contents: [{ parts: [{ text: systemPrompt + '\n\n' + userMessage }] }],
              generationConfig: {
                temperature: 0.4,
                maxOutputTokens: 32000,
                responseMimeType: 'application/json'
              }
            }),
            signal: ctrl.signal
          }
        );
        clearTimeout(t);
        if (!gemRes.ok) {
          const errText = await gemRes.text().catch(() => '');
          console.error('Gemini erro:', gemRes.status, errText.slice(0, 200));
          throw new Error('Gemini HTTP ' + gemRes.status);
        }
        const gemData = await gemRes.json();
        raw = gemData.candidates?.[0]?.content?.parts?.[0]?.text || null;
        if (raw) console.log('✅ Gemini respondeu:', raw.length, 'chars');
      } catch (gemErr) {
        clearTimeout(t);
        console.warn('⚠️ Gemini falhou, fallback OpenAI:', gemErr.message);
        raw = null;
      }
    }

    // Fallback: OpenAI
    if (!raw) {
      console.log('🟡 Gerando peça via OpenAI gpt-4.1...');
      const ctrl2 = new AbortController();
      const t2 = setTimeout(() => ctrl2.abort(), 120000);
      try {
        const oaiRes = await fetch('https://api.openai.com/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`
          },
          body: JSON.stringify({
            model: 'gpt-4.1',
            messages: [
              { role: 'system', content: systemPrompt },
              { role: 'user', content: userMessage }
            ],
            max_tokens: 16000,
            temperature: 0.4,
            response_format: { type: 'json_object' },
            store: false,
            user: 'capi_user_' + req.user.id
          }),
          signal: ctrl2.signal
        });
        clearTimeout(t2);
        if (!oaiRes.ok) {
          const errData = await oaiRes.json().catch(() => ({}));
          return res.status(502).json({ error: errData.error?.message || 'Erro na IA' });
        }
        const oaiData = await oaiRes.json();
        raw = oaiData.choices?.[0]?.message?.content || '{}';
      } catch (oaiErr) {
        clearTimeout(t2);
        throw oaiErr;
      }
    }

    // Parse JSON (limpa markdown fences se houver)
    let parsed;
    try {
      let cleaned = raw.trim();
      if (cleaned.startsWith('```')) {
        cleaned = cleaned.replace(/^```json?\n?/, '').replace(/\n?```$/, '').trim();
      }
      parsed = JSON.parse(cleaned);
    } catch (e) {
      return res.status(502).json({ error: 'Resposta inválida da IA (JSON malformado)', raw: raw?.slice(0, 500) });
    }

    const secoes = (parsed.sections || []).map(s => ({
      id: s.id,
      titulo: s.title,
      conteudo: s.content
    }));

    // Log usage
    const usedModel = GEMINI_API_KEY ? 'gemini-2.5-flash' : 'gpt-4.1';
    const estInputTokens = Math.round(userMessage.length / 3.5);
    const estOutputTokens = Math.round(raw.length / 3.5);
    const estThinkingTokens = GEMINI_API_KEY ? estOutputTokens * 3 : 0;
    const estCost = GEMINI_API_KEY
      ? (estInputTokens/1e6)*0.15 + (estThinkingTokens/1e6)*3.50 + (estOutputTokens/1e6)*0.60
      : (estInputTokens/1e6)*2.00 + (estOutputTokens/1e6)*8.00;
    logAiUsage(req.user.id, 'peca_gerar', usedModel, estInputTokens, estOutputTokens, estThinkingTokens, estCost);

    return res.json({
      secoes,
      tipo_peca: parsed.tipo_peca || '',
      alertas: parsed.alertas || [],
      plano_b: parsed.plano_b || '',
      escolhas_estrategicas: parsed.escolhas_estrategicas || []
    });
  } catch (err) {
    if (err.name === 'AbortError') {
      return res.status(504).json({ error: 'Timeout na geração da peça (120s)' });
    }
    console.error('Erro /api/peca/gerar:', err);
    return res.status(500).json({ error: 'Erro interno ao gerar peça' });
  }
});

// POST /api/peca/regenerar-secao — regenera uma seção específica conforme instrução
app.post('/api/peca/regenerar-secao', authMiddleware, async (req, res) => {
  try {
    const { secao_id, descricao_original, instrucao, conteudo_atual } = req.body;
    if (!secao_id || !instrucao) {
      return res.status(400).json({ error: 'secao_id e instrucao são obrigatórios' });
    }

    const systemPrompt = 'Você é um advogado sênior. Reescreva APENAS a seção indicada da peça jurídica conforme a instrução. Mantenha linguagem forense formal. Retorne APENAS o texto da seção, sem JSON, sem markdown.';

    const userMessage = `SEÇÃO A REESCREVER: ${secao_id}\n\nDESCRIÇÃO ORIGINAL DO CASO:\n${(descricao_original || '').trim()}\n\nCONTEÚDO ATUAL DA SEÇÃO:\n${(conteudo_atual || '').trim()}\n\nINSTRUÇÃO DO ADVOGADO:\n${instrucao.trim()}`;

    let content = null;

    // Gemini primário
    if (GEMINI_API_KEY) {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 120000);
      try {
        const gemRes = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              contents: [{ parts: [{ text: systemPrompt + '\n\n' + userMessage }] }],
              generationConfig: { temperature: 0.4, maxOutputTokens: 8000 }
            }),
            signal: ctrl.signal
          }
        );
        clearTimeout(t);
        if (gemRes.ok) {
          const gemData = await gemRes.json();
          content = gemData.candidates?.[0]?.content?.parts?.[0]?.text || null;
        }
      } catch (e) { clearTimeout(t); }
    }

    // Fallback OpenAI
    if (!content) {
      const ctrl2 = new AbortController();
      const t2 = setTimeout(() => ctrl2.abort(), 120000);
      try {
        const oaiRes = await fetch('https://api.openai.com/v1/chat/completions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${process.env.OPENAI_API_KEY}` },
          body: JSON.stringify({
            model: 'gpt-4.1',
            messages: [{ role: 'system', content: systemPrompt }, { role: 'user', content: userMessage }],
            max_tokens: 8000, temperature: 0.4,
            store: false,
            user: 'capi_user_' + req.user.id
          }),
          signal: ctrl2.signal
        });
        clearTimeout(t2);
        if (!oaiRes.ok) {
          const errData = await oaiRes.json().catch(() => ({}));
          return res.status(502).json({ error: errData.error?.message || 'Erro na IA' });
        }
        const oaiData = await oaiRes.json();
        content = oaiData.choices?.[0]?.message?.content || '';
      } catch (oaiErr) { clearTimeout(t2); throw oaiErr; }
    }

    return res.json({ conteudo: (content || '').trim() });
  } catch (err) {
    if (err.name === 'AbortError') {
      return res.status(504).json({ error: 'Timeout na regeneração da seção (120s)' });
    }
    console.error('Erro /api/peca/regenerar-secao:', err);
    return res.status(500).json({ error: 'Erro interno ao regenerar seção' });
  }
});

// POST /api/peca/exportar — exporta peça como .docx (ABNT)
app.post('/api/peca/exportar', authMiddleware, async (req, res) => {
  try {
    const { secoes, sections: sectionsAlt, tipo_peca } = req.body;
    const secs = secoes || sectionsAlt;
    if (!secs || !Array.isArray(secs) || secs.length === 0) {
      return res.status(400).json({ error: 'secoes é obrigatório e deve ser um array' });
    }

    const profile = db.prepare('SELECT * FROM user_profiles WHERE user_id = ?').get(req.user.id);
    const nome = profile?.nome || 'Advogado(a)';
    const oab = profile?.oab || '[OAB]';
    const cidade = profile?.cidade || '[Cidade]';
    const estado = profile?.estado || '[Estado]';

    const dataAtual = new Date().toLocaleDateString('pt-BR', {
      day: '2-digit', month: 'long', year: 'numeric'
    });

    const romanNumerals = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X',
      'XI', 'XII', 'XIII', 'XIV', 'XV', 'XVI', 'XVII', 'XVIII', 'XIX', 'XX'];

    const docChildren = [];

    // Title
    docChildren.push(new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 400 },
      children: [
        new TextRun({
          text: (tipo_peca || 'PEÇA JURÍDICA').toUpperCase(),
          bold: true,
          size: 28, // 14pt = 28 half-points
          font: 'Times New Roman'
        })
      ]
    }));

    // Sections
    secs.forEach((s, idx) => {
      const titulo = s.titulo || s.title || '';
      const conteudo = s.conteudo || s.content || '';
      const prefix = romanNumerals[idx] ? romanNumerals[idx] + ' — ' : '';

      // Section title
      docChildren.push(new Paragraph({
        alignment: AlignmentType.LEFT,
        spacing: { before: 400, after: 200 },
        children: [
          new TextRun({
            text: prefix + titulo,
            bold: true,
            size: 24, // 12pt
            font: 'Times New Roman'
          })
        ]
      }));

      // Section content — split on newlines
      const paragraphs = conteudo.split('\n').filter(p => p.trim().length > 0);
      paragraphs.forEach(paraText => {
        docChildren.push(new Paragraph({
          alignment: AlignmentType.JUSTIFIED,
          spacing: { line: 360, lineRule: 'auto', after: 200 }, // 1.5 line spacing = 360 twips
          children: [
            new TextRun({
              text: paraText.trim(),
              size: 24,
              font: 'Times New Roman'
            })
          ]
        }));
      });
    });

    // Signature block
    docChildren.push(new Paragraph({ children: [new TextRun({ text: '', size: 24 })], spacing: { before: 600 } }));
    docChildren.push(new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [new TextRun({ text: `${cidade}/${estado}, ${dataAtual}`, size: 24, font: 'Times New Roman' })]
    }));
    docChildren.push(new Paragraph({ children: [new TextRun({ text: '', size: 24 })], spacing: { before: 400 } }));
    docChildren.push(new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [new TextRun({ text: '_'.repeat(50), size: 24, font: 'Times New Roman' })]
    }));
    docChildren.push(new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [new TextRun({ text: nome, bold: true, size: 24, font: 'Times New Roman' })]
    }));
    docChildren.push(new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [new TextRun({ text: `OAB/${estado} nº ${oab}`, size: 24, font: 'Times New Roman' })]
    }));

    const doc = new Document({
      sections: [{
        properties: {
          page: {
            margin: {
              top: 3402,    // 3cm
              bottom: 3402, // 3cm
              right: 3402,  // 3cm
              left: 4536    // 4cm
            }
          }
        },
        children: docChildren
      }]
    });

    const buffer = await Packer.toBuffer(doc);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    res.setHeader('Content-Disposition', 'attachment; filename="peti%C3%A7%C3%A3o.docx"');
    return res.send(buffer);
  } catch (err) {
    console.error('Erro /api/peca/exportar:', err);
    return res.status(500).json({ error: 'Erro interno ao exportar peça' });
  }
});

// ─── ADMIN: AI USAGE ─────────────────────────────────────────
// GET /api/admin/ai-usage
app.get('/api/admin/ai-usage', adminMiddleware, (req, res) => {
  try {
    const days = parseInt(req.query.days) || 30;
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

    const totalRow = db.prepare('SELECT COALESCE(SUM(estimated_cost_usd), 0) as total FROM ai_usage_log WHERE created_at >= ?').get(since);
    const byFeature = db.prepare('SELECT feature, COUNT(*) as count, COALESCE(SUM(estimated_cost_usd), 0) as total_cost FROM ai_usage_log WHERE created_at >= ? GROUP BY feature ORDER BY total_cost DESC').all(since);
    const byModel = db.prepare('SELECT model, COUNT(*) as count, COALESCE(SUM(estimated_cost_usd), 0) as total_cost FROM ai_usage_log WHERE created_at >= ? GROUP BY model ORDER BY total_cost DESC').all(since);
    const byUser = db.prepare(`
      SELECT a.user_id, up.nome, COUNT(*) as count, COALESCE(SUM(a.estimated_cost_usd), 0) as total_cost
      FROM ai_usage_log a
      LEFT JOIN user_profiles up ON up.user_id = a.user_id
      WHERE a.created_at >= ?
      GROUP BY a.user_id
      ORDER BY total_cost DESC
    `).all(since);

    return res.json({
      days,
      total_cost_usd: totalRow.total,
      by_feature: byFeature,
      by_model: byModel,
      by_user: byUser
    });
  } catch (err) {
    console.error('Erro GET /api/admin/ai-usage:', err);
    return res.status(500).json({ error: 'Erro interno' });
  }
});

// ─── HONORÁRIOS API ──────────────────────────────────────────
// GET /api/honorarios — lista todos os estados
app.get('/api/honorarios', (req, res) => {
  const lista = Object.entries(HONORARIOS).map(([sigla, d]) => ({
    sigla, nome: d.nome, ano: d.ano
  }));
  res.json(lista.sort((a, b) => a.nome.localeCompare(b.nome)));
});

// GET /api/honorarios/:sigla — retorna tabela de um estado
app.get('/api/honorarios/:sigla', (req, res) => {
  const d = HONORARIOS[req.params.sigla.toUpperCase()];
  if (!d) return res.status(404).json({ error: 'Estado não encontrado' });
  res.json({ sigla: req.params.sigla.toUpperCase(), ...d });
});

// ─── DASHBOARD DO ADVOGADO ────────────────────────────────────

// Dashboard completo — dados consolidados
app.get('/api/dashboard', authMiddleware, (req, res) => {
  try {
  const userId = req.user.id;

  // ── Perfil ──────────────────────────────────────────────────────
  const profile = db.prepare('SELECT * FROM user_profiles WHERE user_id = ?').get(userId) || {};

  // ── Memórias agrupadas ──────────────────────────────────────────
  const memoriesRaw = db.prepare('SELECT category, insight, relevance_score, created_at FROM user_memory WHERE user_id = ? ORDER BY relevance_score DESC, updated_at DESC').all(userId);
  const grouped = {};
  memoriesRaw.forEach(m => {
    if (!grouped[m.category]) grouped[m.category] = [];
    grouped[m.category].push({ insight: m.insight, score: m.relevance_score, date: m.created_at });
  });

  // ── Casos ativos ────────────────────────────────────────────────
  const cases = db.prepare("SELECT * FROM user_cases WHERE user_id = ? ORDER BY CASE WHEN status = 'ativo' THEN 0 ELSE 1 END, updated_at DESC LIMIT 20").all(userId);

  // ── Resumos recentes ────────────────────────────────────────────
  const summaries = db.prepare(`
    SELECT cs.*, c.title as conv_title
    FROM conversation_summaries cs
    JOIN conversations c ON c.id = cs.conversation_id
    WHERE cs.user_id = ?
    ORDER BY cs.created_at DESC LIMIT 15
  `).all(userId);

  // ── Datas e períodos ────────────────────────────────────────────
  const agora = new Date();
  const mesAtual = `${agora.getFullYear()}-${String(agora.getMonth()+1).padStart(2,'0')}`;

  // ── Stats básicos existentes ────────────────────────────────────
  const totalConversas = db.prepare('SELECT COUNT(*) as c FROM conversations WHERE user_id = ?').get(userId)?.c || 0;
  const totalMensagens = db.prepare("SELECT COUNT(*) as c FROM messages WHERE user_id = ? AND role = 'user'").get(userId)?.c || 0;
  const mensagensMes = db.prepare("SELECT COUNT(*) as c FROM messages m JOIN conversations c ON c.id = m.conversation_id WHERE c.user_id = ? AND m.role = 'user' AND strftime('%Y-%m', m.created_at) = ?").get(userId, mesAtual)?.c || 0;
  const pecasSalvas = db.prepare('SELECT COUNT(*) as c FROM pecas_salvas WHERE user_id = ?').get(userId)?.c || 0;
  const favoritosSalvos = db.prepare('SELECT COUNT(*) as c FROM favorites WHERE user_id = ?').get(userId)?.c || 0;
  const totalMemorias = memoriesRaw.length;
  const totalCasosAtivos = cases.filter(c => c.status === 'ativo').length;

  // Dias ativos este mês
  const diasAtivos = db.prepare(`
    SELECT COUNT(DISTINCT date(m.created_at)) as c FROM messages m
    JOIN conversations c ON c.id = m.conversation_id
    WHERE c.user_id = ? AND m.role = 'user'
    AND strftime('%Y-%m', m.created_at) = ?
  `).get(userId, mesAtual)?.c || 0;

  // Streak (mesma lógica do CapiTreino: conta hoje OU ontem como início)
  const todosDias = db.prepare(`
    SELECT DISTINCT date(m.created_at) as dia FROM messages m
    JOIN conversations c ON c.id = m.conversation_id
    WHERE c.user_id = ? AND m.role = 'user'
    ORDER BY dia DESC
  `).all(userId).map(r => r.dia);
  let streak = 0;
  const hoje = new Date();
  const hojeStr = hoje.toISOString().substring(0,10);
  // Se o dia mais recente é hoje, conta a partir de hoje;
  // se é ontem, conta a partir de ontem (streak ainda ativo).
  if (todosDias.length > 0) {
    const ontem = new Date(hoje);
    ontem.setDate(hoje.getDate() - 1);
    const ontemStr = ontem.toISOString().substring(0,10);
    const inicio = (todosDias[0] === hojeStr || todosDias[0] === ontemStr)
      ? new Date(todosDias[0]) : null;
    if (inicio) {
      for (let i = 0; i < todosDias.length; i++) {
        const esperado = new Date(inicio);
        esperado.setDate(inicio.getDate() - i);
        const esperadoStr = esperado.toISOString().substring(0,10);
        if (todosDias[i] === esperadoStr) streak++;
        else break;
      }
    }
  }

  // ── Dias como membro / primeiro uso ────────────────────────────
  const userRow = db.prepare('SELECT created_at FROM users WHERE id = ?').get(userId);
  const primeiroUso = userRow?.created_at || agora.toISOString();
  const diasComoMembroRaw = Math.floor((agora - new Date(primeiroUso)) / (1000 * 60 * 60 * 24));
  const diasComoMembro = userRow?.created_at ? Math.max(1, diasComoMembroRaw) : 0;

  // ── ai_usage_log para horas economizadas e ferramentas ──────────
  const usageLogs = db.prepare(`
    SELECT feature, model, input_tokens, output_tokens, created_at
    FROM ai_usage_log WHERE user_id = ?
  `).all(userId);

  const usageLogsMes = usageLogs.filter(u => {
    const m = u.created_at ? u.created_at.substring(0, 7) : '';
    return m === mesAtual;
  });

  // Calcular horas economizadas
  function calcHorasFromLog(logs) {
    let horas = 0;
    for (const u of logs) {
      const feat = u.feature || '';
      const outTok = u.output_tokens || 0;
      if (feat === 'peca_gerar') {
        horas += 2;
      } else if (feat === 'audiencia_iniciar' || feat === 'audiencia_responder') {
        horas += 0.5;
      } else if (feat === 'chat') {
        if (outTok > 1500) horas += 1.5;
        else if (outTok > 500) horas += 0.5;
        else horas += 0.25;
      } else if (feat === 'memory_extraction') {
        horas += 0.1;
      } else {
        if (outTok > 1500) horas += 1.5;
        else if (outTok > 500) horas += 0.5;
        else horas += 0.25;
      }
    }
    return Math.round(horas * 100) / 100;
  }

  const horasEconomizadasTotal = calcHorasFromLog(usageLogs);
  const horasEconomizadasMes = calcHorasFromLog(usageLogsMes);
  const minutosPorDiaMedia = diasAtivos > 0
    ? Math.round((horasEconomizadasMes * 60) / diasAtivos)
    : 0;

  // ── Ranking ─────────────────────────────────────────────────────
  // Usuários ativos nos últimos 30 dias por contagem de mensagens
  const rankingRows = db.prepare(`
    SELECT m.user_id, COUNT(*) as cnt
    FROM messages m
    JOIN conversations c ON c.id = m.conversation_id
    WHERE m.role = 'user'
    AND m.created_at >= datetime('now', '-30 days')
    GROUP BY m.user_id
    ORDER BY cnt DESC
  `).all();
  const totalUsuariosAtivos = rankingRows.length;
  const posicaoRanking = rankingRows.findIndex(r => r.user_id === userId) + 1;
  const percentil = totalUsuariosAtivos > 0 && posicaoRanking > 0
    ? Math.round(((totalUsuariosAtivos - posicaoRanking) / totalUsuariosAtivos) * 100)
    : 0;

  // ── Breakdown por ferramenta (ai_usage_log + message keywords) ──
  const countFeature = (feat) => usageLogs.filter(u => u.feature === feat).length;

  const totalPeticoes = countFeature('peca_gerar');
  const totalAudiencias = db.prepare('SELECT COUNT(*) as c FROM audiencia_sessions WHERE user_id = ?').get(userId)?.c || 0;

  // Contar teses, conteúdos, honorários via títulos de conversa e message_analytics
  const chipUsages = db.prepare(`
    SELECT chip_used, COUNT(*) as cnt FROM message_analytics
    WHERE user_id = ? AND chip_used IS NOT NULL
    GROUP BY chip_used
  `).all(userId);
  const chipMap = {};
  chipUsages.forEach(r => { chipMap[r.chip_used.toLowerCase()] = r.cnt; });

  // Somar chips relacionados a cada ferramenta
  function sumChips(keywords) {
    let total = 0;
    for (const [chip, cnt] of Object.entries(chipMap)) {
      if (keywords.some(k => chip.includes(k))) total += cnt;
    }
    return total;
  }

  const totalTeses = sumChips(['tese', 'thesis', 'argumento', 'fundament']) +
    db.prepare(`SELECT COUNT(*) as c FROM conversations WHERE user_id = ? AND (title LIKE '%tese%' OR title LIKE '%argum%')`).get(userId)?.c || 0;
  const totalConteudos = sumChips(['instagram', 'conteúdo', 'conteudo', 'reels', 'marketing', 'post']) +
    db.prepare(`SELECT COUNT(*) as c FROM conversations WHERE user_id = ? AND (title LIKE '%instagram%' OR title LIKE '%conteúdo%' OR title LIKE '%reels%')`).get(userId)?.c || 0;
  const totalHonorarios = sumChips(['honorár', 'honorario', 'cobrar', 'valor', 'fee']) +
    db.prepare(`SELECT COUNT(*) as c FROM conversations WHERE user_id = ? AND (title LIKE '%honorár%' OR title LIKE '%cobrar%' OR title LIKE '%valores%')`).get(userId)?.c || 0;
  const totalCalculos = sumChips(['cálculo', 'calculo', 'calcul', 'parcela', 'juros', 'correção']) +
    db.prepare(`SELECT COUNT(*) as c FROM conversations WHERE user_id = ? AND (title LIKE '%cálculo%' OR title LIKE '%calcul%' OR title LIKE '%juros%')`).get(userId)?.c || 0;

  // Chat: mensagens do usuário que não são chips
  const totalChatMsgs = totalMensagens;

  // ── Uso por ferramenta (array para gráfico) ─────────────────────
  const usoFerramentas = [
    { ferramenta: 'Chat Jurídico', count: totalChatMsgs, icone: '💬' },
    { ferramenta: 'Petições', count: totalPeticoes, icone: '📝' },
    { ferramenta: 'Teses', count: totalTeses, icone: '⚖️' },
    { ferramenta: 'Conteúdo Instagram', count: totalConteudos, icone: '📱' },
    { ferramenta: 'Honorários', count: totalHonorarios, icone: '💰' },
    { ferramenta: 'Simulação Audiência', count: totalAudiencias, icone: '🎓' },
    { ferramenta: 'Cálculos', count: totalCalculos, icone: '🔢' },
  ];

  // ── Tarefas concluídas (substitui valor financeiro) ────────────
  const tarefasConcluidas = {
    total: usageLogs.filter(u => u.feature !== 'memory_extraction').length,
    este_mes: usageLogsMes.filter(u => u.feature !== 'memory_extraction').length,
    breakdown: {
      consultas: usageLogs.filter(u => u.feature === 'chat').length,
      peticoes: totalPeticoes,
      audiencias: totalAudiencias,
      teses: totalTeses,
      honorarios: totalHonorarios,
      conteudos: totalConteudos,
      calculos: totalCalculos,
    }
  };

  // ── Produtividade vs média ─────────────────────────────────────
  const mediaMensagensGeral = totalUsuariosAtivos > 0
    ? Math.round(db.prepare(`
        SELECT AVG(cnt) as avg FROM (
          SELECT COUNT(*) as cnt FROM messages m
          JOIN conversations c ON c.id = m.conversation_id
          WHERE m.role = 'user' AND m.created_at >= datetime('now', '-30 days')
          GROUP BY c.user_id
        )
      `).get()?.avg || 0)
    : 0;
  const minhasMensagens30d = db.prepare(`
    SELECT COUNT(*) as c FROM messages m
    JOIN conversations c ON c.id = m.conversation_id
    WHERE c.user_id = ? AND m.role = 'user'
    AND m.created_at >= datetime('now', '-30 days')
  `).get(userId)?.c || 0;
  const multiplicadorProdutividade = mediaMensagensGeral > 0
    ? Math.round((minhasMensagens30d / mediaMensagensGeral) * 10) / 10
    : 0;

  // ── Calendário de atividade (últimos 90 dias) ──────────────────
  const diasCalendario = db.prepare(`
    SELECT date(m.created_at) as dia, COUNT(*) as cnt
    FROM messages m
    JOIN conversations c ON c.id = m.conversation_id
    WHERE c.user_id = ? AND m.role = 'user'
    AND m.created_at >= datetime('now', '-90 days')
    GROUP BY date(m.created_at)
    ORDER BY dia ASC
  `).all(userId);
  // Converter para mapa dia -> nivel (0-4)
  const maxAtividadeDia = Math.max(...diasCalendario.map(d => d.cnt), 1);
  const calendarioMap = {};
  diasCalendario.forEach(d => {
    const nivel = Math.min(4, Math.ceil((d.cnt / maxAtividadeDia) * 4));
    calendarioMap[d.dia] = { count: d.cnt, nivel };
  });
  // Gerar array dos últimos 90 dias
  const calendario = [];
  for (let i = 89; i >= 0; i--) {
    const d = new Date(agora);
    d.setDate(d.getDate() - i);
    const diaStr = d.toISOString().substring(0, 10);
    const info = calendarioMap[diaStr] || { count: 0, nivel: 0 };
    calendario.push({ dia: diaStr, count: info.count, nivel: info.nivel });
  }

  // ── Evolução mensal (últimos 6 meses) ───────────────────────────
  const evolucao = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date(agora.getFullYear(), agora.getMonth() - i, 1);
    const mesStr = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
    const msgsMes = db.prepare(`
      SELECT COUNT(*) as c FROM messages m
      JOIN conversations c ON c.id = m.conversation_id
      WHERE c.user_id = ? AND m.role = 'user'
      AND strftime('%Y-%m', m.created_at) = ?
    `).get(userId, mesStr)?.c || 0;
    const pecasMes = usageLogs.filter(u =>
      u.feature === 'peca_gerar' && u.created_at && u.created_at.substring(0, 7) === mesStr
    ).length;
    const logsMes = usageLogs.filter(u => u.created_at && u.created_at.substring(0, 7) === mesStr);
    const horasMes = calcHorasFromLog(logsMes);
    evolucao.push({ mes: mesStr, mensagens: msgsMes, peticoes: pecasMes, horas_economizadas: horasMes });
  }

  // ── Badges ──────────────────────────────────────────────────────
  // Primeiro registro de mensagem do usuário
  const primeiraMsg = db.prepare(`
    SELECT m.created_at FROM messages m
    JOIN conversations c ON c.id = m.conversation_id
    WHERE c.user_id = ? AND m.role = 'user'
    ORDER BY m.created_at ASC LIMIT 1
  `).get(userId);
  const primeiraPeca = db.prepare('SELECT created_at FROM pecas_salvas WHERE user_id = ? ORDER BY created_at ASC LIMIT 1').get(userId) ||
    (totalPeticoes > 0 ? usageLogs.filter(u => u.feature === 'peca_gerar').sort((a,b) => a.created_at < b.created_at ? -1 : 1)[0] : null);
  const primeiraAudiencia = db.prepare('SELECT created_at FROM audiencia_sessions WHERE user_id = ? ORDER BY created_at ASC LIMIT 1').get(userId);

  // Calcular max streak histórico
  let maxStreak = 0;
  let curStreakCount = 0;
  for (let i = 0; i < todosDias.length; i++) {
    if (i === 0) { curStreakCount = 1; continue; }
    const prev = new Date(todosDias[i-1]);
    const curr = new Date(todosDias[i]);
    const diffDays = Math.round((prev - curr) / (1000 * 60 * 60 * 24));
    if (diffDays === 1) {
      curStreakCount++;
    } else {
      if (curStreakCount > maxStreak) maxStreak = curStreakCount;
      curStreakCount = 1;
    }
  }
  if (curStreakCount > maxStreak) maxStreak = curStreakCount;

  // Quantas ferramentas distintas foram usadas
  const featuresUsadas = new Set(usageLogs.map(u => u.feature).filter(Boolean));
  const totalFerramentasUsadas = featuresUsadas.size + (totalTeses > 0 ? 1 : 0) + (totalConteudos > 0 ? 1 : 0);

  const badges = [
    {
      id: 'first_msg',
      titulo: 'Primeira Conversa',
      descricao: 'Iniciou sua jornada com a Capi',
      icone: '🚀',
      conquistado: totalMensagens >= 1,
      data: primeiraMsg?.created_at || null,
    },
    {
      id: '10_msgs',
      titulo: '10 Consultas',
      descricao: 'Realizou 10 consultas jurídicas',
      icone: '📚',
      conquistado: totalMensagens >= 10,
      data: totalMensagens >= 10 ? (db.prepare(`SELECT m.created_at FROM messages m JOIN conversations c ON c.id = m.conversation_id WHERE c.user_id = ? AND m.role = 'user' ORDER BY m.created_at ASC LIMIT 1 OFFSET 9`).get(userId)?.created_at || null) : null,
    },
    {
      id: '50_msgs',
      titulo: '50 Consultas',
      descricao: 'Realizou 50 consultas jurídicas',
      icone: '⭐',
      conquistado: totalMensagens >= 50,
      data: totalMensagens >= 50 ? (db.prepare(`SELECT m.created_at FROM messages m JOIN conversations c ON c.id = m.conversation_id WHERE c.user_id = ? AND m.role = 'user' ORDER BY m.created_at ASC LIMIT 1 OFFSET 49`).get(userId)?.created_at || null) : null,
    },
    {
      id: '100_msgs',
      titulo: 'Centurião Jurídico',
      descricao: 'Realizou 100 consultas com a Capi',
      icone: '🏅',
      conquistado: totalMensagens >= 100,
      data: totalMensagens >= 100 ? (db.prepare(`SELECT m.created_at FROM messages m JOIN conversations c ON c.id = m.conversation_id WHERE c.user_id = ? AND m.role = 'user' ORDER BY m.created_at ASC LIMIT 1 OFFSET 99`).get(userId)?.created_at || null) : null,
    },
    {
      id: 'streak_3',
      titulo: '3 Dias Seguidos',
      descricao: 'Usou a Capi 3 dias consecutivos',
      icone: '🔆',
      conquistado: maxStreak >= 3,
      data: maxStreak >= 3 ? (todosDias[todosDias.length - 1] || null) : null,
    },
    {
      id: 'streak_7',
      titulo: '7 Dias Seguidos',
      descricao: 'Usou a Capi 7 dias consecutivos',
      icone: '🔥',
      conquistado: maxStreak >= 7,
      data: maxStreak >= 7 ? (todosDias[todosDias.length - 1] || null) : null,
    },
    {
      id: 'streak_30',
      titulo: '30 Dias de Fogo',
      descricao: '30 dias seguidos com a Capi',
      icone: '🏆',
      conquistado: maxStreak >= 30,
      data: maxStreak >= 30 ? (todosDias[todosDias.length - 1] || null) : null,
    },
    {
      id: 'first_peca',
      titulo: 'Primeira Petição',
      descricao: 'Gerou sua primeira peça jurídica',
      icone: '📝',
      conquistado: totalPeticoes >= 1 || pecasSalvas >= 1,
      data: primeiraPeca?.created_at || null,
    },
    {
      id: '5_pecas',
      titulo: 'Advogado Produtivo',
      descricao: 'Gerou 5 ou mais petições',
      icone: '📋',
      conquistado: totalPeticoes >= 5,
      data: totalPeticoes >= 5 ? (usageLogs.filter(u => u.feature === 'peca_gerar').sort((a,b) => a.created_at < b.created_at ? -1 : 1)[4]?.created_at || null) : null,
    },
    {
      id: 'first_audiencia',
      titulo: 'Estreia na Audiência',
      descricao: 'Participou da primeira simulação de audiência',
      icone: '🎓',
      conquistado: totalAudiencias >= 1,
      data: primeiraAudiencia?.created_at || null,
    },
    {
      id: 'explorer',
      titulo: 'Explorador',
      descricao: 'Usou 4 ou mais ferramentas diferentes',
      icone: '🧭',
      conquistado: totalFerramentasUsadas >= 4,
      data: totalFerramentasUsadas >= 4 ? primeiraMsg?.created_at || null : null,
    },
    {
      id: 'memoravel',
      titulo: 'Memorável',
      descricao: 'A Capi conhece você muito bem (10+ memórias)',
      icone: '🧠',
      conquistado: totalMemorias >= 10,
      data: totalMemorias >= 10 ? (memoriesRaw[9]?.created_at || null) : null,
    },
    {
      id: 'top_10',
      titulo: 'Top 10%',
      descricao: 'Está entre os 10% mais ativos da plataforma',
      icone: '🥇',
      conquistado: percentil >= 90,
      data: percentil >= 90 ? primeiraMsg?.created_at || null : null,
    },
    {
      id: 'membro_30',
      titulo: 'Membro Dedicado',
      descricao: 'Usa a Capi há 30 dias ou mais',
      icone: '🎂',
      conquistado: diasComoMembro >= 30,
      data: diasComoMembro >= 30 ? (() => {
        const d30 = new Date(primeiroUso);
        d30.setDate(d30.getDate() + 30);
        return d30.toISOString().substring(0,10);
      })() : null,
    },
  ];

  // ── Streak do CapiTreino (fonte canônica) ────────────────────
  const ctProg = db.prepare('SELECT streak_atual, streak_max, xp_total, nivel FROM ct_user_progress WHERE user_id = ?').get(userId);

  // ── Subscription (do users table) ─────────────────────────────
  const subUser = db.prepare('SELECT plan_type, plan_expires_at, plan_activated_at, subscription_tier FROM users WHERE id = ?').get(userId);
  const subscription = {
    plan_type: subUser?.plan_type || 'free',
    subscription_tier: subUser?.subscription_tier || 'standard',
    plan_expires_at: subUser?.plan_expires_at || null,
    plan_activated_at: subUser?.plan_activated_at || null,
  };

  // ── Resposta final ──────────────────────────────────────────────
  res.json({
    profile,
    memories: grouped,
    cases,
    summaries,
    subscription,
    stats: {
      // Existentes (snake_case)
      total_conversas: totalConversas,
      total_mensagens: totalMensagens,
      mensagens_mes: mensagensMes,
      pecas_salvas: pecasSalvas,
      favoritos: favoritosSalvos,
      // Aliases camelCase (usados pelo frontend meu-dashboard.html)
      totalMensagens,
      mensagensMes,
      pecasSalvas,
      favoritosSalvos,
      dias_ativos_mes: diasAtivos,
      streak,
      streak_atual: ctProg?.streak_atual || 0,
      streak_max: ctProg?.streak_max || 0,
      xp_total: ctProg?.xp_total || 0,
      nivel: ctProg?.nivel || 1,
      total_memorias: totalMemorias,
      total_casos_ativos: totalCasosAtivos,
      // Tempo economizado
      horas_economizadas_mes: horasEconomizadasMes,
      horas_economizadas_total: horasEconomizadasTotal,
      minutos_por_dia_media: minutosPorDiaMedia,
      // Tarefas e produtividade
      tarefas_total: tarefasConcluidas.total,
      tarefas_mes: tarefasConcluidas.este_mes,
      multiplicador_produtividade: multiplicadorProdutividade,
      media_plataforma_30d: mediaMensagensGeral,
      minhas_mensagens_30d: minhasMensagens30d,
      // Ranking
      percentil,
      posicao_ranking: posicaoRanking || 0,
      total_usuarios_ativos: totalUsuariosAtivos,
      // Ferramentas
      total_peticoes: totalPeticoes,
      total_teses: totalTeses,
      total_conteudos: totalConteudos,
      total_honorarios: totalHonorarios,
      total_audiencias: totalAudiencias,
      total_calculos: totalCalculos,
      // Membership
      dias_como_membro: diasComoMembro,
      primeiro_uso: primeiroUso,
    },
    evolucao,
    uso_ferramentas: usoFerramentas,
    badges,
    tarefas_breakdown: tarefasConcluidas.breakdown,
    calendario,
  });
  } catch(e) { console.error('Dashboard error:', e); res.status(500).json({ error: 'Erro interno do servidor' }); }
});

// Gerenciar memórias do usuário
app.get('/api/memory', authMiddleware, (req, res) => {
  const memories = db.prepare('SELECT id, category, insight, relevance_score, access_count, source, created_at, updated_at FROM user_memory WHERE user_id = ? ORDER BY category, relevance_score DESC').all(req.user.id);
  res.json(memories);
});

app.delete('/api/memory/:id', authMiddleware, (req, res) => {
  const mem = db.prepare('SELECT id FROM user_memory WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
  if (!mem) return res.status(404).json({ error: 'Memória não encontrada' });
  db.prepare('DELETE FROM user_memory WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

// Gerenciar casos
app.get('/api/cases', authMiddleware, (req, res) => {
  try {
    const cases = db.prepare('SELECT * FROM user_cases WHERE user_id = ? ORDER BY CASE WHEN status = ? THEN 0 ELSE 1 END, updated_at DESC').all(req.user.id, 'ativo');
    res.json(cases);
  } catch(e) { console.error('Cases error:', e); res.status(500).json({ error: 'Erro interno do servidor' }); }
});

app.post('/api/cases', authMiddleware, (req, res) => {
  const { titulo, cliente, area, detalhes, proximo_passo, prazo } = req.body;
  if (!titulo) return res.status(400).json({ error: 'Título obrigatório' });
  const result = db.prepare('INSERT INTO user_cases (user_id, titulo, cliente, area, detalhes, proximo_passo, prazo, auto_detected) VALUES (?, ?, ?, ?, ?, ?, ?, 0)').run(
    req.user.id, titulo, cliente || null, area || null, detalhes || null, proximo_passo || null, prazo || null
  );
  res.json({ success: true, id: result.lastInsertRowid });
});

app.patch('/api/cases/:id', authMiddleware, (req, res) => {
  const c = db.prepare('SELECT id FROM user_cases WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
  if (!c) return res.status(404).json({ error: 'Caso não encontrado' });
  const { titulo, cliente, area, status, detalhes, proximo_passo, prazo } = req.body;
  const fields = [];
  const values = [];
  if (titulo !== undefined) { fields.push('titulo = ?'); values.push(titulo); }
  if (cliente !== undefined) { fields.push('cliente = ?'); values.push(cliente); }
  if (area !== undefined) { fields.push('area = ?'); values.push(area); }
  if (status !== undefined) { fields.push('status = ?'); values.push(status); }
  if (detalhes !== undefined) { fields.push('detalhes = ?'); values.push(detalhes); }
  if (proximo_passo !== undefined) { fields.push('proximo_passo = ?'); values.push(proximo_passo); }
  if (prazo !== undefined) { fields.push('prazo = ?'); values.push(prazo); }
  if (fields.length > 0) {
    fields.push("updated_at = datetime('now')");
    values.push(req.params.id);
    db.prepare(`UPDATE user_cases SET ${fields.join(', ')} WHERE id = ?`).run(...values);
  }
  res.json({ success: true });
});

app.delete('/api/cases/:id', authMiddleware, (req, res) => {
  const c = db.prepare('SELECT id FROM user_cases WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
  if (!c) return res.status(404).json({ error: 'Caso não encontrado' });
  db.prepare('DELETE FROM user_cases WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

// Resumos de conversas
app.get('/api/summaries', authMiddleware, (req, res) => {
  const summaries = db.prepare(`
    SELECT cs.*, c.title as conv_title 
    FROM conversation_summaries cs 
    JOIN conversations c ON c.id = cs.conversation_id 
    WHERE cs.user_id = ? 
    ORDER BY cs.created_at DESC LIMIT 30
  `).all(req.user.id);
  res.json(summaries);
});

// Admin: ver memórias de um usuário
app.get('/api/admin/users/:id/memory', adminMiddleware, (req, res) => {
  const memories = db.prepare('SELECT * FROM user_memory WHERE user_id = ? ORDER BY category, relevance_score DESC').all(req.params.id);
  const cases = db.prepare('SELECT * FROM user_cases WHERE user_id = ? ORDER BY updated_at DESC').all(req.params.id);
  const summaries = db.prepare('SELECT cs.*, c.title FROM conversation_summaries cs JOIN conversations c ON c.id = cs.conversation_id WHERE cs.user_id = ? ORDER BY cs.created_at DESC LIMIT 20').all(req.params.id);
  res.json({ memories, cases, summaries });
});

// Dashboard HTML page
app.get('/dashboard.html', (req, res) => {
  res.sendFile(path.join(__dirname, '../frontend/dashboard.html'));
});

// Termos de Uso e Política de Privacidade
app.get('/termos', (req, res) => {
  res.sendFile(path.join(__dirname, '../frontend/termos.html'));
});
app.get('/termos.html', (req, res) => {
  res.sendFile(path.join(__dirname, '../frontend/termos.html'));
});
app.get('/privacidade', (req, res) => {
  res.sendFile(path.join(__dirname, '../frontend/privacidade.html'));
});
app.get('/privacidade.html', (req, res) => {
  res.sendFile(path.join(__dirname, '../frontend/privacidade.html'));
});

// Serve landing page na raiz / — ANTES do express.static
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '../frontend/landing/index.html'));
});

// Serve arquivos estáticos da landing (imagens, etc)
app.use('/landing', express.static(path.join(__dirname, '../frontend/landing')));

// Redirect /landing-v2 → / (301) para links já compartilhados
app.get('/landing-v2', (req, res) => {
  res.redirect(301, '/');
});

// Rota /app serve o sistema (login/chat)
app.get('/app', (req, res) => {
  res.sendFile(path.join(__dirname, '../frontend/index.html'));
});

// Meu Dashboard (dashboard pessoal do aluno)
app.get('/meu-dashboard', (req, res) => {
  res.sendFile(path.join(__dirname, '../frontend/meu-dashboard.html'));
});

// Editor de Peça Jurídica
app.get('/editor-peca.html', (req, res) => {
  res.sendFile(path.join(__dirname, '../frontend/editor-peca.html'));
});

// Treinamento em Audiências
app.get('/treinamento-audiencia.html', (req, res) => {
  res.sendFile(path.join(__dirname, '../frontend/treinamento-audiencia.html'));
});

// ─── CAPITREINO: ROTAS DE PÁGINA ────────────────────────────────
app.get('/capitreino.html', (req, res) => {
  res.sendFile(path.join(__dirname, '../frontend/capitreino.html'));
});
app.get('/capitreino', (req, res) => {
  res.sendFile(path.join(__dirname, '../frontend/capitreino.html'));
});

// ─── CAPITREINO: API ENDPOINTS ──────────────────────────────────

// GET /api/capitreino/status
app.get('/api/capitreino/status', authMiddleware, (req, res) => {
  try {
    const userId = req.user.id;
    const prog = ctGetOrCreateProgress(userId);
    const nivel = ctGetNivel(prog.xp_total);
    const trilha = ctGetTrilhaAtiva(userId);
    const hoje = ctHoje();
    const missoesDia = db.prepare('SELECT COUNT(*) as total, SUM(CASE WHEN status = ? THEN 1 ELSE 0 END) as concluidas FROM ct_missoes_diarias WHERE user_id = ? AND dia = ?').get('concluida', userId, hoje);
    const nivelAtual = nivel;
    const proximoNivel = CT_NIVEIS.find(n => n.nivel === nivelAtual.nivel + 1);
    res.json({
      xp_total: prog.xp_total,
      nivel: nivelAtual.nivel,
      nivel_nome: nivelAtual.nome,
      nivel_emoji: nivelAtual.emoji,
      xp_nivel_min: nivelAtual.xp_min,
      xp_nivel_max: nivelAtual.xp_max === Infinity ? null : nivelAtual.xp_max,
      proximo_nivel: proximoNivel ? { nome: proximoNivel.nome, emoji: proximoNivel.emoji, xp_min: proximoNivel.xp_min } : null,
      streak_atual: prog.streak_atual,
      streak_max: prog.streak_max,
      liga: prog.liga,
      liga_info: CT_LIGAS.find(l => l.id === prog.liga),
      liga_xp_semana: prog.liga_xp_semana,
      trilha_ativa: trilha ? CT_TRILHAS.find(t => t.id === trilha.trilha_id) : null,
      missoes_hoje: { total: missoesDia.total || 0, concluidas: missoesDia.concluidas || 0 },
      missoes_total: prog.missoes_total,
      missoes_concluidas: prog.missoes_concluidas
    });
  } catch (e) {
    console.error('CapiTreino status error:', e);
    res.status(500).json({ error: 'Erro ao carregar status' });
  }
});

// GET /api/capitreino/trilhas
app.get('/api/capitreino/trilhas', authMiddleware, (req, res) => {
  try {
    const userId = req.user.id;
    const trilhas = CT_TRILHAS.map(t => {
      const userTrilha = db.prepare('SELECT * FROM ct_user_trilha WHERE user_id = ? AND trilha_id = ?').get(userId, t.id);
      return { ...t, status: userTrilha ? (userTrilha.completed_at ? 'concluida' : 'ativa') : 'disponivel', started_at: userTrilha?.started_at || null };
    });
    res.json({ trilhas });
  } catch (e) {
    console.error('CapiTreino trilhas error:', e);
    res.status(500).json({ error: 'Erro ao carregar trilhas' });
  }
});

// POST /api/capitreino/trilha/selecionar
app.post('/api/capitreino/trilha/selecionar', authMiddleware, (req, res) => {
  try {
    const userId = req.user.id;
    const { trilha_id } = req.body;
    if (!trilha_id || !CT_TRILHAS.find(t => t.id === trilha_id)) {
      return res.status(400).json({ error: 'Trilha inválida' });
    }
    const ativa = ctGetTrilhaAtiva(userId);
    if (ativa) {
      db.prepare('UPDATE ct_user_trilha SET completed_at = datetime(?) WHERE id = ?').run(new Date().toISOString(), ativa.id);
    }
    db.prepare('INSERT INTO ct_user_trilha (user_id, trilha_id) VALUES (?, ?)').run(userId, trilha_id);
    ctGetOrCreateProgress(userId);
    const missoes = ctGerarMissoesDiarias(userId, trilha_id);
    res.json({ success: true, trilha: CT_TRILHAS.find(t => t.id === trilha_id), missoes });
  } catch (e) {
    console.error('CapiTreino selecionar trilha error:', e);
    res.status(500).json({ error: 'Erro ao selecionar trilha' });
  }
});

// GET /api/capitreino/missoes
app.get('/api/capitreino/missoes', authMiddleware, (req, res) => {
  try {
    const userId = req.user.id;
    const trilha = ctGetTrilhaAtiva(userId);
    if (!trilha) {
      return res.json({ missoes: [], needsTrilha: true });
    }
    const missoes = ctGerarMissoesDiarias(userId, trilha.trilha_id);
    const missoesComDica = missoes.map(m => {
      const banco = CT_MISSOES_BANCO.find(b => b.id === m.missao_id) || CT_MISSOES_SEXTA.find(b => b.id === m.missao_id);
      return { ...m, dica: banco?.dica || null };
    });
    res.json({ missoes: missoesComDica, trilha: CT_TRILHAS.find(t => t.id === trilha.trilha_id) });
  } catch (e) {
    console.error('CapiTreino missoes error:', e);
    res.status(500).json({ error: 'Erro ao carregar missões' });
  }
});

// POST /api/capitreino/missoes/:id/concluir
app.post('/api/capitreino/missoes/:id/concluir', authMiddleware, (req, res) => {
  try {
    const userId = req.user.id;
    const missaoId = parseInt(req.params.id);
    const { comprovacao_url } = req.body || {};
    const missao = db.prepare('SELECT * FROM ct_missoes_diarias WHERE id = ? AND user_id = ?').get(missaoId, userId);
    if (!missao) return res.status(404).json({ error: 'Missão não encontrada' });
    if (missao.status === 'concluida') return res.json({ success: true, message: 'Missão já concluída', xp: 0 });

    // Auto-verificação para missões com comprovacao_tipo 'auto'
    let autoVerificado = null;
    let dicaExtra = null;
    if (missao.comprovacao_tipo === 'auto') {
      const msgCount = db.prepare("SELECT COUNT(*) as c FROM messages WHERE conversation_id IN (SELECT id FROM conversations WHERE user_id = ?) AND role = 'user' AND created_at >= datetime('now', '-24 hours')").get(userId);
      if (msgCount && msgCount.c > 0) {
        autoVerificado = true;
      } else {
        autoVerificado = false;
        dicaExtra = 'Use o chat da Capi para maximizar seu aprendizado!';
      }
    }

    db.prepare("UPDATE ct_missoes_diarias SET status = 'concluida', concluida_at = datetime(?), comprovacao_url = ? WHERE id = ?").run(new Date().toISOString(), comprovacao_url || null, missaoId);
    const xp = missao.xp_recompensa;
    const prog = ctGetOrCreateProgress(userId);
    const hoje = ctHoje();
    const semana = ctSemanaAtual();
    let novoStreak = prog.streak_atual;
    if (prog.ultimo_dia_ativo !== hoje) {
      const ontem = new Date();
      ontem.setDate(ontem.getDate() - 1);
      const ontemStr = ontem.toISOString().split('T')[0];
      novoStreak = (prog.ultimo_dia_ativo === ontemStr) ? prog.streak_atual + 1 : 1;
    }
    const ligaSemana = prog.liga_semana === semana ? prog.liga_xp_semana + xp : xp;
    db.prepare('UPDATE ct_user_progress SET xp_total = xp_total + ?, missoes_concluidas = missoes_concluidas + 1, streak_atual = ?, streak_max = MAX(streak_max, ?), ultimo_dia_ativo = ?, liga_xp_semana = ?, liga_semana = ?, updated_at = datetime(?) WHERE user_id = ?').run(xp, novoStreak, novoStreak, hoje, ligaSemana, semana, new Date().toISOString(), userId);
    const newProg = ctGetOrCreateProgress(userId);
    const newNivel = ctGetNivel(newProg.xp_total);
    const oldNivel = ctGetNivel(newProg.xp_total - xp);
    const levelUp = newNivel.nivel > oldNivel.nivel;
    if (levelUp) {
      db.prepare('UPDATE ct_user_progress SET nivel = ? WHERE user_id = ?').run(newNivel.nivel, userId);
    }
    // Check and award badges
    const newBadges = ctCheckAndAwardBadges(userId);

    // Check if all daily missions are complete for day summary
    const trilha = ctGetTrilhaAtiva(userId);
    const trilhaId = trilha ? trilha.trilha_id : null;
    let allComplete = false;
    let daySummary = null;
    if (trilhaId) {
      const hoje = ctHoje();
      const missoesDia = db.prepare("SELECT COUNT(*) as total, SUM(CASE WHEN status = 'concluida' THEN 1 ELSE 0 END) as concluidas FROM ct_missoes_diarias WHERE user_id = ? AND dia = ? AND trilha_id = ?").get(userId, hoje, trilhaId);
      allComplete = missoesDia.total > 0 && missoesDia.concluidas === missoesDia.total;
      if (allComplete) {
        const todayXp = db.prepare("SELECT COALESCE(SUM(xp_recompensa),0) as total FROM ct_missoes_diarias WHERE user_id = ? AND dia = ? AND trilha_id = ? AND status = 'concluida'").get(userId, hoje, trilhaId);
        const todayBadges = db.prepare("SELECT badge_id FROM capitreino_conquistas WHERE user_id = ? AND date(desbloqueado_em) = ?").all(userId, hoje).map(r => {
          const b = CT_BADGES.find(bg => bg.id === r.badge_id);
          return b || null;
        }).filter(Boolean);
        daySummary = {
          missions_completed: missoesDia.concluidas,
          missions_total: missoesDia.total,
          xp_earned: todayXp.total,
          streak: novoStreak,
          level: newNivel.nivel,
          level_name: newNivel.nome,
          badges_earned_today: todayBadges
        };
      }
    }

    const result = { success: true, xp_ganho: xp, xp_total: newProg.xp_total, streak: novoStreak, level_up: levelUp, novo_nivel: levelUp ? newNivel : null, new_badges: newBadges, all_complete: allComplete, day_summary: daySummary };
    if (autoVerificado !== null) result.auto_verificado = autoVerificado;
    if (dicaExtra) result.dica_extra = dicaExtra;
    res.json(result);
  } catch (e) {
    console.error('CapiTreino concluir missao error:', e);
    res.status(500).json({ error: 'Erro ao concluir missão' });
  }
});

// POST /api/capitreino/missoes/:id/dica
app.post('/api/capitreino/missoes/:id/dica', authMiddleware, (req, res) => {
  try {
    const userId = req.user.id;
    const missaoId = parseInt(req.params.id);
    const missao = db.prepare('SELECT * FROM ct_missoes_diarias WHERE id = ? AND user_id = ?').get(missaoId, userId);
    if (!missao) return res.status(404).json({ error: 'Missão não encontrada' });
    const banco = CT_MISSOES_BANCO.find(b => b.id === missao.missao_id) || CT_MISSOES_SEXTA.find(b => b.id === missao.missao_id);
    res.json({ dica: banco?.dica || 'Use a Capi para te ajudar nessa missão!' });
  } catch (e) {
    console.error('CapiTreino dica error:', e);
    res.status(500).json({ error: 'Erro ao carregar dica' });
  }
});

// GET /api/capitreino/bau
app.get('/api/capitreino/bau', authMiddleware, (req, res) => {
  try {
    const userId = req.user.id;
    const hoje = ctHoje();
    const trilha = ctGetTrilhaAtiva(userId);
    const trilhaId = trilha ? trilha.trilha_id : null;
    const bau = db.prepare('SELECT * FROM ct_baus WHERE user_id = ? AND dia = ? AND tipo = ?').get(userId, hoje, 'diario');
    const missoesDia = trilhaId
      ? db.prepare('SELECT COUNT(*) as total, SUM(CASE WHEN status = ? THEN 1 ELSE 0 END) as concluidas FROM ct_missoes_diarias WHERE user_id = ? AND dia = ? AND trilha_id = ?').get('concluida', userId, hoje, trilhaId)
      : { total: 0, concluidas: 0 };
    const todasConcluidas = missoesDia.total > 0 && missoesDia.concluidas === missoesDia.total;
    res.json({
      bau: bau || null,
      pode_abrir: todasConcluidas && bau && !bau.aberto,
      missoes_concluidas: missoesDia.concluidas || 0,
      missoes_total: missoesDia.total || 0
    });
  } catch (e) {
    console.error('CapiTreino bau error:', e);
    res.status(500).json({ error: 'Erro ao carregar baú' });
  }
});

// POST /api/capitreino/bau/abrir
app.post('/api/capitreino/bau/abrir', authMiddleware, (req, res) => {
  try {
    const userId = req.user.id;
    const hoje = ctHoje();
    const bau = db.prepare('SELECT * FROM ct_baus WHERE user_id = ? AND dia = ? AND tipo = ?').get(userId, hoje, 'diario');
    if (!bau) return res.status(404).json({ error: 'Baú não encontrado' });
    if (bau.aberto) return res.json({ success: true, message: 'Baú já aberto', xp: 0 });
    const trilha = ctGetTrilhaAtiva(userId);
    const trilhaId = trilha ? trilha.trilha_id : null;
    const missoesDia = trilhaId
      ? db.prepare('SELECT COUNT(*) as total, SUM(CASE WHEN status = ? THEN 1 ELSE 0 END) as concluidas FROM ct_missoes_diarias WHERE user_id = ? AND dia = ? AND trilha_id = ?').get('concluida', userId, hoje, trilhaId)
      : { total: 0, concluidas: 0 };
    if (missoesDia.concluidas < missoesDia.total) {
      return res.status(400).json({ error: 'Complete todas as missões para abrir o baú' });
    }
    const bonusXp = bau.recompensa_xp || 50;
    db.prepare('UPDATE ct_baus SET aberto = 1, recompensa_xp = ? WHERE id = ?').run(bonusXp, bau.id);
    const semana = ctSemanaAtual();
    const prog = ctGetOrCreateProgress(userId);
    const ligaSemana = prog.liga_semana === semana ? prog.liga_xp_semana + bonusXp : bonusXp;
    db.prepare('UPDATE ct_user_progress SET xp_total = xp_total + ?, liga_xp_semana = ?, liga_semana = ?, updated_at = datetime(?) WHERE user_id = ?').run(bonusXp, ligaSemana, semana, new Date().toISOString(), userId);
    const newProg = ctGetOrCreateProgress(userId);
    res.json({ success: true, xp_ganho: bonusXp, xp_total: newProg.xp_total, recompensa_tipo: 'xp_bonus' });
  } catch (e) {
    console.error('CapiTreino abrir bau error:', e);
    res.status(500).json({ error: 'Erro ao abrir baú' });
  }
});

// GET /api/capitreino/liga
app.get('/api/capitreino/liga', authMiddleware, (req, res) => {
  try {
    const userId = req.user.id;
    const prog = ctGetOrCreateProgress(userId);
    const semana = ctSemanaAtual();
    const ligaInfo = CT_LIGAS.find(l => l.id === prog.liga);
    const ranking = db.prepare('SELECT p.user_id, p.liga_xp_semana, p.liga, u.name FROM ct_user_progress p JOIN users u ON p.user_id = u.id WHERE p.liga = ? AND p.liga_semana = ? ORDER BY p.liga_xp_semana DESC LIMIT 20').all(prog.liga, semana);
    const meuRank = ranking.findIndex(r => r.user_id === userId) + 1;
    res.json({
      liga: prog.liga,
      liga_info: ligaInfo,
      xp_semana: prog.liga_xp_semana,
      semana,
      ranking,
      meu_rank: meuRank || ranking.length + 1
    });
  } catch (e) {
    console.error('CapiTreino liga error:', e);
    res.status(500).json({ error: 'Erro ao carregar liga' });
  }
});

// GET /api/capitreino/historico
app.get('/api/capitreino/historico', authMiddleware, (req, res) => {
  try {
    const userId = req.user.id;
    const limit = parseInt(req.query.limit) || 30;
    const historico = db.prepare("SELECT * FROM ct_missoes_diarias WHERE user_id = ? AND status = 'concluida' ORDER BY concluida_at DESC LIMIT ?").all(userId, limit);
    res.json({ historico });
  } catch (e) {
    console.error('CapiTreino historico error:', e);
    res.status(500).json({ error: 'Erro ao carregar histórico' });
  }
});

// GET /api/capitreino/historico/heatmap
app.get('/api/capitreino/historico/heatmap', authMiddleware, (req, res) => {
  try {
    const userId = req.user.id;
    const days = db.prepare(`
      SELECT dia as date,
        COUNT(*) as missions_completed,
        COALESCE(SUM(xp_recompensa), 0) as xp_earned
      FROM ct_missoes_diarias
      WHERE user_id = ? AND status = 'concluida'
        AND dia >= date('now', '-90 days')
      GROUP BY dia
      ORDER BY dia
    `).all(userId);
    res.json({ days });
  } catch (e) {
    console.error('CapiTreino heatmap error:', e);
    res.status(500).json({ error: 'Erro ao carregar heatmap' });
  }
});

// GET /api/capitreino/conquistas
app.get('/api/capitreino/conquistas', authMiddleware, (req, res) => {
  try {
    const userId = req.user.id;
    const unlocked = db.prepare('SELECT badge_id, desbloqueado_em FROM capitreino_conquistas WHERE user_id = ?').all(userId);
    const unlockedMap = {};
    unlocked.forEach(u => { unlockedMap[u.badge_id] = u.desbloqueado_em; });
    const conquistas = CT_BADGES.map(b => ({
      badge_id: b.id,
      nome: b.nome,
      descricao: b.descricao,
      imagem: b.imagem,
      desbloqueado: !!unlockedMap[b.id],
      desbloqueado_em: unlockedMap[b.id] || null
    }));
    res.json({ conquistas });
  } catch (e) {
    console.error('CapiTreino conquistas error:', e);
    res.status(500).json({ error: 'Erro ao carregar conquistas' });
  }
});

// GET /api/capitreino/reminder-check
app.get('/api/capitreino/reminder-check', authMiddleware, (req, res) => {
  try {
    const userId = req.user.id;
    const hoje = ctHoje();
    const trilha = ctGetTrilhaAtiva(userId);
    if (!trilha) return res.json({ should_remind: false });
    const missoes = db.prepare(
      "SELECT COUNT(*) as total, SUM(CASE WHEN status = 'concluida' THEN 1 ELSE 0 END) as concluidas FROM ct_missoes_diarias WHERE user_id = ? AND dia = ? AND trilha_id = ?"
    ).get(userId, hoje, trilha.trilha_id);
    const pendentes = (missoes.total || 0) - (missoes.concluidas || 0);
    const prog = ctGetOrCreateProgress(userId);
    res.json({
      should_remind: pendentes > 0,
      missoes_pendentes: pendentes,
      missoes_total: missoes.total || 0,
      streak: prog.streak_atual,
      xp_total: prog.xp_total
    });
  } catch (e) {
    console.error('CapiTreino reminder-check error:', e);
    res.status(500).json({ error: 'Erro ao verificar lembretes' });
  }
});

// Serve arquivos estáticos do app — HTML sem cache, demais com cache
app.use(express.static(path.join(__dirname, '../frontend'), {
  setHeaders: (res, filePath) => {
    if (filePath.endsWith('.html')) {
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    }
  }
}));

// Catch-all SPA — deve ficar após todas as rotas de API
app.get('/api/user/stats', authMiddleware, (req, res) => {
  const userId = req.user.id;
  const inicioMes = new Date();
  inicioMes.setDate(1);
  inicioMes.setHours(0, 0, 0, 0);
  const msgs = db.prepare("SELECT COUNT(*) as c FROM messages WHERE conversation_id IN (SELECT id FROM conversations WHERE user_id = ?) AND role = 'assistant' AND created_at >= ?").get(userId, inicioMes.toISOString());
  const totalMsgs = msgs?.c || 0;
  const horasEconomizadas = Math.round(totalMsgs * 0.5);
  res.json({ pecas: totalMsgs, horas: horasEconomizadas });
});

app.get('/{*path}', (req, res) => {
  res.sendFile(path.join(__dirname, '../frontend/index.html'));
});

// ─── TEXT-TO-SPEECH (ElevenLabs) ─────────────────────────────
// ─── TREINAMENTO EM AUDIÊNCIAS 2.0 ───────────────────────────────────────────

// Helper: pick judge based on session ID (deterministic)
function getJuizForSession(sessionId) {
  const juizes = [
    { nome: 'Dra. Ana Beatriz Ferreira', estilo: 'rigorosa e metódica, exige fundamentação precisa, interrompe quando o advogado divaga' },
    { nome: 'Dr. Carlos Eduardo Mendonça', estilo: 'conciliador mas firme, tenta acordo antes de tudo, fica impaciente com litigância desnecessária' },
    { nome: 'Dra. Fernanda Lima Castro', estilo: 'técnica e fria, faz perguntas incômodas, questiona cada afirmação sem base legal' },
    { nome: 'Dr. Roberto Alves Pereira', estilo: 'experiente e sarcástico, já viu de tudo, pressiona advogados jovens com perguntas difíceis' }
  ];
  return juizes[sessionId % juizes.length];
}

// Helper: build rich system prompt per phase
function buildAudienciaPrompt(session, fase, dificuldade) {
  const { tipo, papel, contexto, id } = session;
  const juiz = getJuizForSession(id);

  const dificuldadeMap = {
    iniciante: 'Seja moderado nas objeções. Dê tempo ao advogado. Faça perguntas orientadoras quando ele errar. O adversário é competente mas não agressivo.',
    intermediario: 'Faça objeções técnicas. O adversário cita jurisprudência e faz pressão real. O juiz questiona fundamentos. Ritmo de audiência real.',
    veterano: 'O adversário é brilhante — cita jurisprudência específica, faz objeções procedimentais, pede a palavra frequentemente. O juiz é rigoroso, indeferindo pedidos mal fundamentados. Simule incidentes processuais inesperados.'
  };

  const papelAdversario = papel === 'Advogado do Autor' ? 'do Réu' : 'do Autor';

  const faseInstrucoes = {
    abertura: `FASE 1 — ABERTURA DA AUDIÊNCIA
Você é ${juiz.nome}, juiz(a) ${juiz.estilo}.
Abra a audiência formalmente: pregão, verificação de presença, qualificação.
Apresente o caso brevemente.
Conceda a palavra ao advogado do ${papel} para sustentação/exposição inicial.
Se o advogado não fundamentar bem, INTERROMPA e peça clareza.
O advogado adversário ainda não fala nesta fase.`,

    conciliacao: `FASE 2 — TENTATIVA DE CONCILIAÇÃO
Tente a conciliação. Pergunte às partes se há possibilidade de acordo.
O ADVOGADO ADVERSÁRIO faz uma proposta/posição:
🔴 [Adv. ${papelAdversario}]: "[proposta realista baseada no caso]"
Pressione ambas as partes. Se o advogado treinando recusar, peça justificativa.
Se aceitar termos ruins, o juiz deve alertar sobre possíveis prejuízos ao cliente.`,

    depoimento: `FASE 3 — INSTRUÇÃO E DEPOIMENTOS
Fase de produção de provas.
Primeiro: depoimento pessoal da parte contrária. O juiz faz perguntas.
Depois: o advogado treinando pode fazer perguntas à parte adversária (contradita/reperguntas).
O ADVOGADO ADVERSÁRIO faz objeções quando pertinente:
🔴 [Adv. adversário]: "Meritíssimo, OBJEÇÃO — [fundamento da objeção]"
Simule uma TESTEMUNHA com depoimento que pode ter contradições para o advogado explorar.
O juiz decide objeções e conduz a instrução.
Quando for testemunha, use: 🟡 [Testemunha]: "texto"`,

    alegacoes: `FASE 4 — ALEGAÇÕES FINAIS
Conceda a palavra para alegações finais.
O ADVOGADO ADVERSÁRIO apresenta alegações finais:
🔴 [Adv. adversário]: "[alegações finais técnicas e persuasivas com artigos de lei]"
Depois, conceda a palavra ao advogado treinando.
O juiz pode fazer perguntas finais pontuais.
AVALIE internamente a performance mas não revele ainda.`,

    sentenca: `FASE 5 — ENCERRAMENTO
O juiz anuncia que vai analisar o caso e proferir sentença.
Faça um breve resumo do que foi apresentado.
NÃO dê a sentença — apenas indique que os autos estão conclusos.
Encerre a audiência formalmente.
Adicione ao final: [AUDIÊNCIA ENCERRADA]`
  };

  return `Você está conduzindo uma simulação de ${tipo} para TREINAMENTO de advogado.

CONTEXTO DO CASO: ${contexto}
O advogado EM TREINAMENTO representa: ${papel}
DIFICULDADE: ${dificuldadeMap[dificuldade] || dificuldadeMap.intermediario}

${faseInstrucoes[fase] || faseInstrucoes.abertura}

REGRAS GERAIS:
1. Use linguagem formal de audiência brasileira real.
2. Quando for a vez do advogado adversário, use SEMPRE o formato: 🔴 [Adv. adversário]: "texto"
3. Quando for testemunha, use: 🟡 [Testemunha]: "texto"
4. Sempre termine deixando claro de quem é a vez de falar.
5. Respostas de 2-4 parágrafos para manter ritmo dinâmico.
6. Se o advogado treinando cometer erro processual, o juiz deve reagir realisticamente (indeferir, advertir, etc).
7. Mantenha coerência com o que já foi dito no histórico da audiência.`;
}

// Helper: call Gemini 2.5 Flash with fallback to GPT-4.1
async function callAudienciaAI(systemPrompt, conversationHistory, userId, feature) {
  let raw = null;
  let usedModel = 'gpt-4.1';

  if (GEMINI_API_KEY) {
    console.log('✨ Audiência 2.0 via Gemini 2.5 Flash...');
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 60000);
    try {
      const historyForGemini = [
        { role: 'user', parts: [{ text: systemPrompt }] },
        { role: 'model', parts: [{ text: 'Entendido. Estou pronto para conduzir a simulação conforme as instruções.' }] },
        ...conversationHistory.map(m => ({
          role: m.role === 'assistant' ? 'model' : 'user',
          parts: [{ text: m.content }]
        }))
      ];
      const gemRes = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: historyForGemini,
            generationConfig: {
              temperature: 0.85,
              maxOutputTokens: 1500
            }
          }),
          signal: ctrl.signal
        }
      );
      clearTimeout(t);
      if (!gemRes.ok) {
        const errText = await gemRes.text().catch(() => '');
        console.error('Gemini audiência erro:', gemRes.status, errText.slice(0, 200));
        throw new Error('Gemini HTTP ' + gemRes.status);
      }
      const gemData = await gemRes.json();
      raw = gemData.candidates?.[0]?.content?.parts?.[0]?.text || null;
      if (raw) {
        usedModel = 'gemini-2.5-flash';
        const inputTokens = gemData.usageMetadata?.promptTokenCount || Math.ceil(systemPrompt.length / 4);
        const outputTokens = gemData.usageMetadata?.candidatesTokenCount || Math.ceil(raw.length / 4);
        const thinkingTokens = gemData.usageMetadata?.thoughtsTokenCount || 0;
        const cost = (inputTokens * 0.000000075) + (outputTokens * 0.0000003) + (thinkingTokens * 0.0000035);
        logAiUsage(userId, feature, usedModel, inputTokens, outputTokens, thinkingTokens, cost);
        console.log('✅ Gemini audiência respondeu:', raw.length, 'chars');
      }
    } catch (gemErr) {
      clearTimeout(t);
      console.warn('⚠️ Gemini audiência falhou, fallback OpenAI:', gemErr.message);
      raw = null;
    }
  }

  // Fallback: OpenAI GPT-4.1
  if (!raw) {
    console.log('🟡 Audiência 2.0 via OpenAI gpt-4.1...');
    const ctrl2 = new AbortController();
    const t2 = setTimeout(() => ctrl2.abort(), 60000);
    try {
      const oaiMessages = [
        { role: 'system', content: systemPrompt },
        ...conversationHistory
      ];
      const oaiRes = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${OPENAI_API_KEY}`
        },
        body: JSON.stringify({
          model: 'gpt-4.1',
          messages: oaiMessages,
          temperature: 0.85,
          max_tokens: 1500,
          store: false,
          user: 'capi_user_' + userId
        }),
        signal: ctrl2.signal
      });
      clearTimeout(t2);
      if (!oaiRes.ok) {
        const errData = await oaiRes.json().catch(() => ({}));
        throw new Error(errData.error?.message || 'Erro OpenAI HTTP ' + oaiRes.status);
      }
      const oaiData = await oaiRes.json();
      raw = oaiData.choices?.[0]?.message?.content || '';
      if (raw) {
        const inputTokens = oaiData.usage?.prompt_tokens || Math.ceil(systemPrompt.length / 4);
        const outputTokens = oaiData.usage?.completion_tokens || Math.ceil(raw.length / 4);
        const cost = (inputTokens * 0.000002) + (outputTokens * 0.000008);
        logAiUsage(userId, feature, 'gpt-4.1', inputTokens, outputTokens, 0, cost);
      }
    } catch (oaiErr) {
      clearTimeout(t2);
      throw new Error('Falha em ambos os modelos: ' + oaiErr.message);
    }
  }

  return raw;
}

// Fases em ordem
const AUDIENCIA_FASES = ['abertura', 'conciliacao', 'depoimento', 'alegacoes', 'sentenca'];
// Exchanges per phase before auto-advancing
const EXCHANGES_POR_FASE = { abertura: 2, conciliacao: 3, depoimento: 3, alegacoes: 2, sentenca: 1 };

// Helper: get exchange count for a fase from historico
function getExchangeCountForFase(historico, fase) {
  return historico.filter(m => m.role === 'user' && m.fase === fase).length;
}

// Helper: determine next phase
function getNextFase(faseAtual) {
  const idx = AUDIENCIA_FASES.indexOf(faseAtual);
  if (idx < 0 || idx >= AUDIENCIA_FASES.length - 1) return faseAtual;
  return AUDIENCIA_FASES[idx + 1];
}

// ── POST /api/audiencia/iniciar ────────────────────────────────────────────────
app.post('/api/audiencia/iniciar', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.id;
    const { tipo, papel, contexto, dificuldade = 'intermediario' } = req.body;
    if (!tipo || !papel || !contexto) {
      return res.status(400).json({ error: 'Campos obrigatórios: tipo, papel, contexto' });
    }

    // Create session in DB
    const insert = db.prepare(
      `INSERT INTO audiencia_sessions (user_id, tipo, papel, contexto, dificuldade, fase_atual, historico, status)
       VALUES (?, ?, ?, ?, ?, 'abertura', '[]', 'ativa')`
    );
    const result = insert.run(userId, tipo, papel, contexto, dificuldade);
    const sessionId = result.lastInsertRowid;

    const session = { id: sessionId, tipo, papel, contexto, dificuldade };
    const juiz = getJuizForSession(sessionId);
    const systemPrompt = buildAudienciaPrompt(session, 'abertura', dificuldade);

    // Generate opening
    const openingMsg = await callAudienciaAI(
      systemPrompt,
      [],
      userId,
      'audiencia_iniciar'
    );

    // Save to historico
    const historico = [{ role: 'assistant', content: openingMsg, fase: 'abertura', ts: new Date().toISOString() }];
    db.prepare('UPDATE audiencia_sessions SET historico = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
      .run(JSON.stringify(historico), sessionId);

    res.json({
      session_id: sessionId,
      fase: 'abertura',
      juiz_nome: juiz.nome,
      mensagem_juiz: openingMsg,
      fases: AUDIENCIA_FASES
    });
  } catch (e) {
    console.error('Audiência iniciar erro:', e);
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

// ── POST /api/audiencia/responder ──────────────────────────────────────────────
app.post('/api/audiencia/responder', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.id;
    const { session_id, mensagem } = req.body;
    if (!session_id || !mensagem) {
      return res.status(400).json({ error: 'Campos obrigatórios: session_id, mensagem' });
    }

    // Load session
    const session = db.prepare('SELECT * FROM audiencia_sessions WHERE id = ? AND user_id = ?').get(session_id, userId);
    if (!session) return res.status(404).json({ error: 'Sessão não encontrada' });
    if (session.status === 'concluida') {
      return res.status(400).json({ error: 'Sessão já encerrada. Use /api/audiencia/encerrar para obter feedback.' });
    }

    let historico = JSON.parse(session.historico || '[]');
    const faseAtual = session.fase_atual || 'abertura';

    // Append user message
    historico.push({ role: 'user', content: mensagem, fase: faseAtual, ts: new Date().toISOString() });

    // Build conversation for AI (last 12 messages)
    const conversationForAI = historico.slice(-12).map(m => ({ role: m.role, content: m.content }));

    // Check if we need to advance phase
    const userExchangesInFase = getExchangeCountForFase(historico, faseAtual);
    const maxExchanges = EXCHANGES_POR_FASE[faseAtual] || 2;
    let nextFase = faseAtual;
    let shouldAdvance = false;
    if (userExchangesInFase >= maxExchanges && faseAtual !== 'sentenca') {
      nextFase = getNextFase(faseAtual);
      shouldAdvance = true;
    }

    const sessionForPrompt = { id: session.id, tipo: session.tipo, papel: session.papel, contexto: session.contexto };
    const systemPrompt = buildAudienciaPrompt(sessionForPrompt, nextFase, session.dificuldade);

    // Add phase transition instruction if advancing
    const phaseTransitionNote = shouldAdvance && nextFase !== faseAtual
      ? `

[TRANSIÇÃO: Encerre a fase de ${faseAtual} e inicie a fase de ${nextFase} naturalmente, sem quebrar o fluxo da audiência.]`
      : '';

    const fullPrompt = systemPrompt + phaseTransitionNote;

    const resposta = await callAudienciaAI(
      fullPrompt,
      conversationForAI,
      userId,
      'audiencia_responder'
    );

    // Detect if sentenca phase ended
    const audienciaEncerrada = resposta.includes('[AUDIÊNCIA ENCERRADA]') || nextFase === 'sentenca';

    // Append AI response to historico
    historico.push({ role: 'assistant', content: resposta, fase: nextFase, ts: new Date().toISOString() });

    // Update DB
    const newStatus = audienciaEncerrada && nextFase === 'sentenca' ? 'aguardando_feedback' : 'ativa';
    db.prepare(
      'UPDATE audiencia_sessions SET historico = ?, fase_atual = ?, status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?'
    ).run(JSON.stringify(historico), nextFase, newStatus, session_id);

    // Quick tip (only for iniciante difficulty)
    let dica_rapida = null;
    if (session.dificuldade === 'iniciante') {
      const dicas = [
        'Lembre-se de sempre citar o dispositivo legal que fundamenta seu argumento.',
        'Mantenha contato visual com o juiz, não com a parte adversária.',
        'Ao fazer perguntas à testemunha, prefira perguntas abertas.',
        'Quando o adversário fizer uma objeção, responda antes que o juiz decida.',
        'Organize seus argumentos em: fato → norma → consequência jurídica.'
      ];
      if (Math.random() < 0.4) {
        dica_rapida = dicas[Math.floor(Math.random() * dicas.length)];
      }
    }

    const faseIndex = AUDIENCIA_FASES.indexOf(nextFase);
    const faseProgresso = Math.round(((faseIndex + 1) / AUDIENCIA_FASES.length) * 100);

    res.json({
      fase: nextFase,
      fase_anterior: faseAtual,
      fase_avancou: shouldAdvance && nextFase !== faseAtual,
      mensagem_juiz: resposta,
      fase_progresso: faseProgresso,
      audiencia_encerrada: audienciaEncerrada,
      ...(dica_rapida ? { dica_rapida } : {})
    });
  } catch (e) {
    console.error('Audiência responder erro:', e);
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

// ── POST /api/audiencia/encerrar ───────────────────────────────────────────────
app.post('/api/audiencia/encerrar', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.id;
    const { session_id } = req.body;
    if (!session_id) return res.status(400).json({ error: 'session_id obrigatório' });

    const session = db.prepare('SELECT * FROM audiencia_sessions WHERE id = ? AND user_id = ?').get(session_id, userId);
    if (!session) return res.status(404).json({ error: 'Sessão não encontrada' });
    if (session.status === 'concluida') {
      // Already concluded — return saved feedback
      try {
        const feedback = JSON.parse(session.feedback || 'null');
        return res.json({ feedback, nota_geral: session.nota_geral, cached: true });
      } catch {
        return res.json({ feedback: null, nota_geral: session.nota_geral, cached: true });
      }
    }

    const historico = JSON.parse(session.historico || '[]');

    const feedbackPrompt = `Você é um professor de prática jurídica avaliando a performance de um advogado em treinamento de audiência.

TRANSCRIÇÃO COMPLETA DA AUDIÊNCIA:
${JSON.stringify(historico)}

TIPO: ${session.tipo}
PAPEL: ${session.papel}
DIFICULDADE: ${session.dificuldade}

Avalie em JSON EXATO neste formato (sem markdown, apenas JSON puro):
{
  "nota_geral": 7.5,
  "competencias": {
    "argumentacao_juridica": { "nota": 8, "comentario": "Fundamentou bem com art. 18 CDC..." },
    "oratoria_postura": { "nota": 7, "comentario": "Boa fluência mas..." },
    "controle_emocional": { "nota": 6, "comentario": "Perdeu a calma quando..." },
    "estrategia_processual": { "nota": 8, "comentario": "Boa decisão ao recusar..." },
    "dominio_fatos": { "nota": 7, "comentario": "Conhece os fatos mas..." },
    "tecnica_perguntas": { "nota": 6, "comentario": "Perguntas poderiam ser mais incisivas..." }
  },
  "pontos_fortes": ["ponto 1 específico", "ponto 2", "ponto 3"],
  "pontos_melhorar": ["ponto 1 específico", "ponto 2", "ponto 3"],
  "momentos_chave": [
    { "momento": "descrição do momento", "avaliacao": "avaliação do que ocorreu" },
    { "momento": "descrição do momento", "avaliacao": "avaliação do que ocorreu" }
  ],
  "dica_final": "Dica prática e motivacional",
  "nota_por_fase": {
    "abertura": 7,
    "conciliacao": 8,
    "depoimento": 6,
    "alegacoes": 7
  }
}`;

    const feedbackRaw = await callAudienciaAI(
      feedbackPrompt,
      [{ role: 'user', content: 'Gere o feedback completo da audiência em JSON.' }],
      userId,
      'audiencia_feedback'
    );

    let feedback;
    try {
      const cleaned = feedbackRaw.replace(/```json?\n?/g, '').replace(/```/g, '').trim();
      feedback = JSON.parse(cleaned);
    } catch (parseErr) {
      console.warn('Feedback JSON parse falhou, usando fallback:', parseErr.message);
      feedback = {
        nota_geral: 7,
        competencias: {},
        pontos_fortes: ['Participou da audiência completa'],
        pontos_melhorar: ['Continue praticando regularmente'],
        momentos_chave: [],
        dica_final: feedbackRaw.slice(0, 500),
        nota_por_fase: {}
      };
    }

    const notaGeral = feedback.nota_geral || 7;

    // Update session to concluded
    db.prepare(
      "UPDATE audiencia_sessions SET feedback = ?, nota_geral = ?, status = 'concluida', updated_at = CURRENT_TIMESTAMP WHERE id = ?"
    ).run(JSON.stringify(feedback), notaGeral, session_id);

    res.json({ feedback, nota_geral: notaGeral });
  } catch (e) {
    console.error('Audiência encerrar erro:', e);
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

// ── GET /api/audiencia/historico ───────────────────────────────────────────────
app.get('/api/audiencia/historico', authMiddleware, (req, res) => {
  try {
    const userId = req.user.id;
    const sessions = db.prepare(
      `SELECT id, tipo, papel, dificuldade, nota_geral, status, created_at
       FROM audiencia_sessions
       WHERE user_id = ?
       ORDER BY created_at DESC
       LIMIT 50`
    ).all(userId);
    res.json({
      sessions: sessions.map(s => ({
        id: s.id,
        tipo: s.tipo,
        papel: s.papel,
        dificuldade: s.dificuldade,
        data: s.created_at,
        nota_geral: s.nota_geral,
        status: s.status
      }))
    });
  } catch (e) {
    console.error('Audiência histórico erro:', e);
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

// ── GET /api/audiencia/sessao/:id ──────────────────────────────────────────────
app.get('/api/audiencia/sessao/:id', authMiddleware, (req, res) => {
  try {
    const userId = req.user.id;
    const sessionId = parseInt(req.params.id, 10);
    if (isNaN(sessionId)) return res.status(400).json({ error: 'ID inválido' });

    const session = db.prepare('SELECT * FROM audiencia_sessions WHERE id = ? AND user_id = ?').get(sessionId, userId);
    if (!session) return res.status(404).json({ error: 'Sessão não encontrada' });

    let historico = [];
    let feedback = null;
    try { historico = JSON.parse(session.historico || '[]'); } catch (e) { /* ignore */ }
    try { feedback = session.feedback ? JSON.parse(session.feedback) : null; } catch (e) { /* ignore */ }

    const juiz = getJuizForSession(session.id);

    res.json({
      id: session.id,
      tipo: session.tipo,
      papel: session.papel,
      contexto: session.contexto,
      dificuldade: session.dificuldade,
      fase_atual: session.fase_atual,
      status: session.status,
      nota_geral: session.nota_geral,
      juiz_nome: juiz.nome,
      historico,
      feedback,
      created_at: session.created_at,
      updated_at: session.updated_at
    });
  } catch (e) {
    console.error('Audiência sessão erro:', e);
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

// ─── USER STATS ───────────────────────────────────────────


app.post('/api/tts', authMiddleware, async (req, res) => {
  const { text } = req.body;
  if (!text) return res.status(400).json({ error: 'Texto ausente' });
  if (!ELEVENLABS_API_KEY) return res.status(500).json({ error: 'ElevenLabs não configurado' });

  // Limita a 1000 chars para não gastar créditos demais
  const cleanText = text.replace(/[*_~`#>]/g, '').substring(0, 1000);

  try {
    const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${ELEVENLABS_VOICE_ID}`, {
      method: 'POST',
      headers: {
        'Accept': 'audio/mpeg',
        'Content-Type': 'application/json',
        'xi-api-key': ELEVENLABS_API_KEY
      },
      body: JSON.stringify({
        text: cleanText,
        model_id: 'eleven_multilingual_v2',
        voice_settings: { stability: 0.5, similarity_boost: 0.85, style: 0.3, use_speaker_boost: true }
      })
    });

    if (!response.ok) {
      const err = await response.text();
      console.error('ElevenLabs erro:', err);
      return res.status(502).json({ error: 'Erro ao gerar áudio' });
    }

    const audioBuffer = await response.arrayBuffer();
    // Log uso TTS — custo estimado por caractere (ElevenLabs ~$0.30/1k chars no plano padrão)
    try {
      const charCount = cleanText.length;
      const ttsCost = (charCount / 1000) * 0.30;
      logAiUsage(req.user.id, 'tts', 'elevenlabs-multilingual-v2', charCount, 0, 0, ttsCost);
    } catch(e) {}
    res.set('Content-Type', 'audio/mpeg');
    res.set('Content-Length', audioBuffer.byteLength);
    res.send(Buffer.from(audioBuffer));
  } catch (e) {
    console.error('TTS erro:', e.message);
    res.status(500).json({ error: 'Erro interno TTS' });
  }
});

// ══════════════════════════════════════════════════════════════
// WIZARD — Geração guiada de peças jurídicas
// ══════════════════════════════════════════════════════════════
app.post('/api/pecas/generate', authMiddleware, async (req, res) => {
  try {
    const { tipo, foro, vara, autor, reu, numero_processo, fatos, fundamentos, pedidos, valor_causa, observacoes, incluir_jurisprudencia, upload_ids } = req.body;
    if (!tipo || !tipo.trim()) return res.status(400).json({ error: 'Tipo de peça é obrigatório' });
    if (!fatos || !fatos.trim()) return res.status(400).json({ error: 'Fatos são obrigatórios' });
    if (!pedidos || !pedidos.trim()) return res.status(400).json({ error: 'Pedidos são obrigatórios' });

    // Get user profile
    const profile = db.prepare('SELECT * FROM user_profiles WHERE user_id = ?').get(req.user.id);
    const nome = profile?.nome || 'Advogado(a)';
    const oab = profile?.oab || '[OAB]';
    const cidade = profile?.cidade || '[Cidade]';
    const estado = profile?.estado || '[Estado]';

    const hoje = new Date();
    const dataFormatada = hoje.toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' });

    // Get uploaded document context if any
    let docContext = '';
    if (upload_ids && upload_ids.length > 0) {
      const placeholders = upload_ids.map(() => '?').join(',');
      const docs = db.prepare(`SELECT original_name, extracted_text FROM conversation_uploads WHERE id IN (${placeholders}) AND user_id = ?`).all(...upload_ids, req.user.id);
      docs.forEach(d => {
        if (d.extracted_text) {
          docContext += `\n\n--- DOCUMENTO ANEXADO: ${d.original_name} ---\n${d.extracted_text.substring(0, 15000)}\n`;
        }
      });
    }

    const systemPrompt = `Você é o melhor advogado processualista do Brasil, reconhecido por produzir peças jurídicas densas, persuasivas e tecnicamente impecáveis.

Sua missão é redigir uma peça jurídica COMPLETA, ENCORPADA, REAL e PRONTA PARA PROTOCOLAR.

FILOSOFIA: Cada peça que você produz é um "Projeto de Sentença" (Art. 489 CPC) — escrita para que o juiz copie seus argumentos direto na decisão.

DADOS DO ADVOGADO:
- Nome: ${nome}
- OAB: ${oab}
- Cidade: ${cidade}/${estado}
- Data: ${dataFormatada}

INSTRUÇÕES OBRIGATÓRIAS:
1. Gere a peça COMPLETA, do cabeçalho ao fechamento
2. Use formatação profissional com numeração adequada
3. Inclua fundamentação legal (artigos de lei${incluir_jurisprudencia ? ', jurisprudência e súmulas pertinentes' : ''})
4. Use linguagem jurídica formal adequada ao tipo de peça
5. Inclua TODOS os elementos obrigatórios para este tipo de peça
6. Ao final, inclua local, data e espaço para assinatura
7. USE OS FATOS FORNECIDOS — não use placeholders genéricos
8. Colchetes APENAS para CPF, RG, endereço, dados não informados
9. Gere o texto completo em formato legível (não JSON), com parágrafos bem estruturados
10. A peça deve ter no MÍNIMO 2000 palavras para ser considerada completa
11. Seção de fatos: MÍNIMO 5 parágrafos longos e detalhados
12. Seção de direito: MÍNIMO 6 parágrafos com artigos específicos
13. Seção de pedidos: liste TODOS os pedidos de forma detalhada`;

    const userMessage = `Gere uma peça jurídica completa com base nos dados abaixo:

TIPO DE PEÇA: ${tipo}
${foro ? 'FORO: ' + foro : ''}
${vara ? 'VARA: ' + vara : ''}
AUTOR/REQUERENTE: ${autor || '[A ser qualificado]'}
RÉU/REQUERIDO: ${reu || '[A ser qualificado]'}
${numero_processo ? 'PROCESSO Nº: ' + numero_processo : ''}

FATOS:
${fatos}

FUNDAMENTOS JURÍDICOS:
${fundamentos || 'Sugira os fundamentos mais adequados para o caso'}

PEDIDOS:
${pedidos}

${valor_causa ? 'VALOR DA CAUSA: R$ ' + valor_causa : ''}
${observacoes ? 'OBSERVAÇÕES: ' + observacoes : ''}
${docContext ? '\nDOCUMENTOS ANEXADOS PARA CONTEXTO:' + docContext : ''}

Gere a peça jurídica COMPLETA agora.`;

    // Call OpenAI gpt-4.1
    console.log(`📋 Wizard: gerando ${tipo} para user ${req.user.id}...`);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 120000);
    let raw = null;

    // Try Gemini first if available
    if (GEMINI_API_KEY) {
      try {
        console.log('🔵 Wizard: tentando Gemini 2.5 Flash...');
        const gemCtrl = new AbortController();
        const gemTimeout = setTimeout(() => gemCtrl.abort(), 120000);
        const gemRes = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ role: 'user', parts: [{ text: systemPrompt + '\n\n' + userMessage }] }],
            generationConfig: { temperature: 0.4, maxOutputTokens: 32000 }
          }),
          signal: gemCtrl.signal
        });
        clearTimeout(gemTimeout);
        if (gemRes.ok) {
          const gemData = await gemRes.json();
          raw = gemData.candidates?.[0]?.content?.parts?.[0]?.text || null;
          if (raw) console.log('✅ Wizard Gemini respondeu:', raw.length, 'chars');
        } else {
          throw new Error('Gemini HTTP ' + gemRes.status);
        }
      } catch (gemErr) {
        console.warn('⚠️ Wizard Gemini falhou, fallback OpenAI:', gemErr.message);
        raw = null;
      }
    }

    // Fallback: OpenAI
    if (!raw) {
      console.log('🟡 Wizard: gerando via OpenAI gpt-4.1...');
      const oaiCtrl = new AbortController();
      const oaiTimeout = setTimeout(() => oaiCtrl.abort(), 120000);
      try {
        const oaiRes = await fetch('https://api.openai.com/v1/chat/completions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${OPENAI_API_KEY}` },
          body: JSON.stringify({
            model: 'gpt-4.1',
            messages: [
              { role: 'system', content: systemPrompt },
              { role: 'user', content: userMessage }
            ],
            max_tokens: 32000,
            temperature: 0.4,
            store: false,
            user: 'capi_user_' + req.user.id
          }),
          signal: oaiCtrl.signal
        });
        clearTimeout(oaiTimeout);
        if (!oaiRes.ok) {
          const errData = await oaiRes.json().catch(() => ({}));
          return res.status(502).json({ error: errData.error?.message || 'Erro na IA' });
        }
        const oaiData = await oaiRes.json();
        raw = oaiData.choices?.[0]?.message?.content || '';
      } catch (oaiErr) {
        clearTimeout(oaiTimeout);
        throw oaiErr;
      }
    }
    clearTimeout(timeout);

    if (!raw || raw.length < 100) {
      return res.status(502).json({ error: 'A IA não conseguiu gerar a peça. Tente novamente.' });
    }

    // Create conversation with the generated document
    const title = tipo.substring(0, 55) + ' — Wizard';
    const conv = db.prepare('INSERT INTO conversations (user_id, title) VALUES (?, ?)').run(req.user.id, title);
    const convId = conv.lastInsertRowid;

    // Insert messages: user request + AI response
    const userSummary = `[Wizard] Gerar ${tipo}\nForo: ${foro || '-'}\nAutor: ${autor || '-'}\nRéu: ${reu || '-'}\nFatos: ${fatos.substring(0, 200)}...`;
    db.prepare('INSERT INTO messages (conversation_id, user_id, role, content, tokens) VALUES (?, ?, ?, ?, ?)').run(convId, req.user.id, 'user', userSummary, 0);
    db.prepare('INSERT INTO messages (conversation_id, user_id, role, content, tokens) VALUES (?, ?, ?, ?, ?)').run(convId, req.user.id, 'assistant', raw, Math.round(raw.length / 3.5));

    // Auto-save to favorites
    db.prepare('INSERT INTO favorites (user_id, title, content) VALUES (?, ?, ?)').run(req.user.id, `${tipo} — Wizard`, raw);

    // Log usage
    const estInputTokens = Math.round(userMessage.length / 3.5);
    const estOutputTokens = Math.round(raw.length / 3.5);
    const usedModel = GEMINI_API_KEY && raw ? 'gemini-2.5-flash' : 'gpt-4.1';
    if (typeof logAiUsage === 'function') {
      const estThinkingTokens = usedModel === 'gemini-2.5-flash' ? estOutputTokens * 3 : 0;
      const estCost = usedModel === 'gemini-2.5-flash'
        ? (estInputTokens / 1e6) * 0.15 + (estThinkingTokens / 1e6) * 3.50 + (estOutputTokens / 1e6) * 0.60
        : (estInputTokens / 1e6) * 2.00 + (estOutputTokens / 1e6) * 8.00;
      logAiUsage(req.user.id, 'wizard_gerar', usedModel, estInputTokens, estOutputTokens, estThinkingTokens, estCost);
    }

    console.log(`✅ Wizard: peça gerada (${raw.length} chars) → conversa ${convId}`);
    return res.json({
      content: raw,
      conversation_id: convId,
      suggestions: [
        'Revise a seção de fatos',
        'Adicione mais jurisprudência',
        'Mude o tom para mais formal',
        'Exporte para Word'
      ]
    });
  } catch (err) {
    console.error('❌ Wizard erro:', err.message);
    return res.status(500).json({ error: 'Erro interno ao gerar peça. Tente novamente.' });
  }
});

// ─── GLOBAL ERROR HANDLER ────────────────────────────────────────
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ error: 'Erro interno do servidor' });
});

const server = app.listen(PORT, () => console.log(`✅ Capi Când-IA Pro rodando na porta ${PORT}`));
// Railway/proxies podem matar conexões idle — mantém vivas por mais tempo
server.keepAliveTimeout = 120000; // 120s (Railway default é 60s)
server.headersTimeout = 125000;   // deve ser > keepAliveTimeout
server.timeout = 0;               // sem timeout no server (timeout é controlado por AbortController no fetch)


