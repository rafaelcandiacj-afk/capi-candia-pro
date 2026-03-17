const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3001;
const JWT_SECRET = process.env.JWT_SECRET || 'capi-candia-secret-2026';
const OPENAI_API_KEY = process.env.OPENAI_API_KEY || '';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'capiAdmin2026';
const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY || 'sk_ef7c32daa249f0825ec017f69aa8721b2ca641739c552e8d';
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
    last_login TEXT
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
    anos_experiencia TEXT,
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
`);

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

📚 BASE DE CONHECIMENTO:
- +300 teses jurídicas escaláveis (Família, Previdenciário, Trabalhista, Cível, Criminal, Tributário, Empresarial)
- O Método Capi Cândia (6 pilares completos)
- Os 15 Passos do Atendimento Poderoso
- Scripts de WhatsApp, Meta Ads e Google Ads
- FAQ dos alunos da Comunidade
- Histórias reais do Rafael: TDAH, FIES, venda de celular, brigadeiro, carreta da justiça
- Código de Ética da OAB

🎙️ PERSONALIDADE E TOM DE VOZ (modo PapiCrítico™):
- Fala como Rafael Cândia falaria — humano, direto, com calor humano e humor
- Usa: "papi", "meu patrão", "capivarístico", "AUUUU!" (máximo 1x por conversa)
- PapiCrítico™: puxa a orelha com humor quando o aluno está procrastinando ou se vitimizando
- Se adapta ao nível de experiência do usuário (iniciante/intermediário/avançado)
- Máximo 4-5 parágrafos por resposta. Termine SEMPRE com uma pergunta de acompanhamento.
- Usa emojis com moderação e propósito

📌 FRASES-CHAVE DO RAFAEL:
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

app.use(cors());
app.use(express.json({ limit: '10mb' }));
// NOTA: express.static movido para após as rotas de API (ver final do arquivo)

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

function adminMiddleware(req, res, next) {
  const adminPass = req.headers['x-admin-password'];
  if (adminPass !== ADMIN_PASSWORD) return res.status(403).json({ error: 'Acesso negado' });
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
      const pdfParse = require('pdf-parse');
      const buffer = fs.readFileSync(filePath);
      const data = await pdfParse(buffer);
      if (data.text && data.text.trim().length > 50) return data.text;
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
async function getEmbedding(text) {
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
async function searchKnowledge(query, topK = 5) {
  const chunks = db.prepare('SELECT kc.id, kc.content, kc.embedding, kf.original_name FROM knowledge_chunks kc JOIN knowledge_files kf ON kf.id = kc.file_id WHERE kf.status = ? AND kc.embedding IS NOT NULL').all('ready');
  
  if (chunks.length === 0) return [];
  
  try {
    const queryEmbedding = await getEmbedding(query);
    
    const scored = chunks.map(chunk => {
      const emb = JSON.parse(chunk.embedding);
      const score = cosineSimilarity(queryEmbedding, emb);
      return { ...chunk, score };
    });
    
    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, topK).filter(c => c.score > 0.3);
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
          const emb = await getEmbedding(chunk.content);
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

// ─── AUTH ─────────────────────────────────────────────────────
app.post('/api/register', async (req, res) => {
  const { name, email, password } = req.body;
  if (!name || !email || !password) return res.status(400).json({ error: 'Preencha todos os campos' });
  try {
    const hash = await bcrypt.hash(password, 10);
    const result = db.prepare('INSERT INTO users (name, email, password) VALUES (?, ?, ?)').run(name, email.toLowerCase(), hash);
    const token = jwt.sign({ id: result.lastInsertRowid, email, name }, JWT_SECRET, { expiresIn: '30d' });
    res.json({ token, user: { id: result.lastInsertRowid, name, email } });
  } catch (e) {
    if (e.message.includes('UNIQUE')) return res.status(400).json({ error: 'Email já cadastrado' });
    res.status(500).json({ error: 'Erro ao criar conta' });
  }
});

app.post('/api/login', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'Preencha todos os campos' });
  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email.toLowerCase());
  if (!user) return res.status(401).json({ error: 'Email ou senha incorretos' });
  if (!user.active) return res.status(403).json({ error: 'Conta desativada. Entre em contato com o suporte.' });
  const valid = await bcrypt.compare(password, user.password);
  if (!valid) return res.status(401).json({ error: 'Email ou senha incorretos' });
  db.prepare("UPDATE users SET last_login = datetime('now') WHERE id = ?").run(user.id);
  const token = jwt.sign({ id: user.id, email: user.email, name: user.name }, JWT_SECRET, { expiresIn: '30d' });
  res.json({ token, user: { id: user.id, name: user.name, email: user.email } });
});

// ─── CONVERSAS ────────────────────────────────────────────────
app.get('/api/conversations', authMiddleware, (req, res) => {
  const convs = db.prepare(`
    SELECT c.id, c.title, c.created_at, c.updated_at,
           COUNT(m.id) as message_count
    FROM conversations c
    LEFT JOIN messages m ON m.conversation_id = c.id
    WHERE c.user_id = ?
    GROUP BY c.id
    ORDER BY c.updated_at DESC
    LIMIT 50
  `).all(req.user.id);
  res.json(convs);
});

app.post('/api/conversations', authMiddleware, (req, res) => {
  const { title } = req.body;
  const result = db.prepare('INSERT INTO conversations (user_id, title) VALUES (?, ?)').run(req.user.id, title || 'Nova conversa');
  res.json({ id: result.lastInsertRowid, title: title || 'Nova conversa' });
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

// ─── CHAT COM RAG ─────────────────────────────────────────────
app.post('/api/chat', authMiddleware, async (req, res) => {
  const { messages, conversation_id, upload_id } = req.body;
  if (!messages || !Array.isArray(messages)) return res.status(400).json({ error: 'Mensagens inválidas' });
  if (!OPENAI_API_KEY) return res.status(500).json({ error: 'API key não configurada' });

  const systemPrompt = db.prepare("SELECT value FROM settings WHERE key = 'system_prompt'").get()?.value || '';
  
  // Injeta memória do usuário (nome, área, cidade)
  const userProfile = db.prepare('SELECT * FROM user_profiles WHERE user_id = ?').get(req.user.id);
  let profileCtx = '';
  const hasProfile = userProfile && userProfile.nome;
  if (hasProfile) {
    profileCtx = `\n\n👤 PERFIL DO USUÁRIO ATUAL:\n- Nome: ${userProfile.nome}\n- Área: ${userProfile.area || 'não informada'}\n- Experiência: ${userProfile.anos_experiencia || 'não informada'}\n- Cidade: ${userProfile.cidade || 'não informada'}\n\nIMPORTANTE: Você JÁ SABE quem é este usuário. NÃO pergunte o nome nem a área dele. Chame-o pelo nome (${userProfile.nome}) e use a área (${userProfile.area || 'Direito'}) como contexto padrão nas suas respostas.`;
  }
  
  // Pega a última mensagem do usuário para busca semântica
  const lastUserMsg = messages.filter(m => m.role === 'user').pop();
  
  let ragContext = '';
  if (lastUserMsg) {
    try {
      const relevantChunks = await searchKnowledge(lastUserMsg.content, 5);
      if (relevantChunks.length > 0) {
        ragContext = '\n\n━━━ CONHECIMENTO DO RAFAEL CÂNDIA (use isto para responder) ━━━\n';
        relevantChunks.forEach((chunk, i) => {
          ragContext += `\n[${i+1}] Fonte: ${chunk.original_name}\n${chunk.content}\n`;
        });
        ragContext += '\n━━━ FIM DO CONHECIMENTO ━━━\n';
        ragContext += '\nIMPORTANTE: Use os trechos acima como base para a resposta. Seja específico, cite exemplos e metodologias do Rafael quando relevante.';
      }
    } catch (e) {
      console.error('Erro RAG (continuando sem contexto):', e.message);
    }
  }

  // Detecta se é a primeira mensagem da conversa (sem histórico de assistant)
  const hasAssistantHistory = messages.some(m => m.role === 'assistant');
  const isFirstMessage = !hasAssistantHistory;
  
  // Contexto de personalização: só pergunta nome/área se NÃO tiver perfil salvo
  let personalizationCtx = '';
  if (isFirstMessage && !hasProfile) {
    personalizationCtx = '\n\nINSTRUÇÃO ESPECIAL (APENAS NESTA RESPOSTA): O usuário acabou de iniciar a conversa e AINDA NÃO tem perfil salvo. Ao final da sua resposta, faça UMA pergunta curta e amigável perguntando o nome do advogado e em qual área do Direito ele atua (ex: Família, Previdenciário, Trabalhista, Criminal, etc). Exemplo: \'Antes de continuar, me conta: qual é o seu nome e em qual área você atua?\'';
  }

  // Injeta documento enviado na conversa
  let docCtx = '';
  if (upload_id) {
    const upload = db.prepare('SELECT original_name, extracted_text FROM conversation_uploads WHERE id = ? AND user_id = ?').get(upload_id, req.user.id);
    if (upload && upload.extracted_text) {
      docCtx = `\n\n━━━ DOCUMENTO ENVIADO PELO USUÁRIO ━━━\nArquivo: ${upload.original_name}\n\n${upload.extracted_text}\n━━━ FIM DO DOCUMENTO ━━━\nAnalise e responda com base neste documento quando relevante.`;
    }
  }

  // Injeta tabela de honorários se o usuário perguntar sobre quanto cobrar
  let honorariosCtx = '';
  const lastMsg = messages.filter(m => m.role === 'user').pop()?.content?.toLowerCase() || '';
  const isHonorarioQuery = lastMsg.includes('cobrar') || lastMsg.includes('honorar') || 
    lastMsg.includes('quanto') && (lastMsg.includes('ação') || lastMsg.includes('acao') || lastMsg.includes('causa') || lastMsg.includes('processo') || lastMsg.includes('tabela') || lastMsg.includes('oab')) ||
    lastMsg.includes('tabela oab') || lastMsg.includes('valor mínimo') || lastMsg.includes('valor minimo') ||
    lastMsg.includes('precificar') || lastMsg.includes('preço') || lastMsg.includes('preco');
  
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
    for (const [nome, sigla] of Object.entries(estadoMap)) {
      if (msgComEspacos.includes(nome)) { estadoSigla = sigla; break; }
    }
    
    if (estadoSigla && HONORARIOS[estadoSigla]) {
      const h = HONORARIOS[estadoSigla];
      honorariosCtx = `\n\n💰 TABELA DE HONORÁRIOS OAB/${estadoSigla} (${h.ano}):\n- Cível: ${h.civel}\n- Trabalhista: ${h.trabalhista}\n- Família: ${h.familia}\n- Criminal: ${h.criminal}\n- Previdenciário/INSS: ${h.previdenciario}\n- Consulta: ${h.consulta}\n- Obs: ${h.obs}\n\nUSE ESTES DADOS para responder sobre honorários mínimos. Lembre sempre que são valores MÍNIMOS e que o advogado pode e deve cobrar mais conforme complexidade, urgência e condição do cliente.`;
    } else {
      honorariosCtx = `\n\n💰 CONTEXTO HONORÁRIOS: O usuário perguntou sobre quanto cobrar. Peça o estado onde será a ação e o tipo de caso. Você tem acesso à tabela OAB de todos os 27 estados — assim que souber o estado, poderá informar os valores mínimos exatos.`;
    }
  }

  const fullSystemPrompt = systemPrompt + profileCtx + ragContext + docCtx + personalizationCtx + honorariosCtx;

  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${OPENAI_API_KEY}` },
      body: JSON.stringify({
        model: 'gpt-4o',
        messages: [{ role: 'system', content: fullSystemPrompt }, ...messages.slice(-20)],
        temperature: 0.75,
        max_tokens: 1500
      })
    });

    const data = await response.json();
    if (!response.ok) return res.status(502).json({ error: data.error?.message || 'Erro na OpenAI' });

    const reply = data.choices[0].message.content;
    const tokens = data.usage?.total_tokens || 0;
    const userId = req.user.id;

    let convId = conversation_id;
    if (!convId) {
      const firstUserMsg = messages.find(m => m.role === 'user');
      const title = firstUserMsg ? firstUserMsg.content.substring(0, 60) : 'Nova conversa';
      const conv = db.prepare('INSERT INTO conversations (user_id, title) VALUES (?, ?)').run(userId, title);
      convId = conv.lastInsertRowid;
    } else {
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
        db.prepare('INSERT OR REPLACE INTO user_profiles (user_id, nome, area, cidade, anos_experiencia, updated_at) VALUES (?, ?, ?, ?, ?, datetime("now"))').run(userId, nome || null, area || null, existingProfile?.cidade || null, existingProfile?.anos_experiencia || null);
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
            { role: 'system', content: 'Gere exatamente 3 perguntas curtas de follow-up (máximo 8 palavras cada) relacionadas à resposta abaixo. Retorne APENAS um JSON array de strings, sem markdown. Exemplo: ["Pergunta 1?","Pergunta 2?","Pergunta 3?"]' },
            { role: 'user', content: reply.substring(0, 500) }
          ],
          temperature: 0.7,
          max_tokens: 150
        })
      });
      if (sugResponse.ok) {
        const sugData = await sugResponse.json();
        const sugText = sugData.choices[0]?.message?.content || '[]';
        const parsed = JSON.parse(sugText.replace(/```json?\n?/g, '').replace(/```/g, '').trim());
        if (Array.isArray(parsed)) suggestions = parsed.slice(0, 3);
      }
    } catch (e) {
      console.error('Erro ao gerar sugestões:', e.message);
    }

    res.json({ reply, tokens, conversation_id: convId, suggestions });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Erro ao conectar com a OpenAI' });
  }
});

// ─── ADMIN ────────────────────────────────────────────────────

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
  const { active } = req.body;
  db.prepare('UPDATE users SET active = ? WHERE id = ?').run(active ? 1 : 0, req.params.id);
  res.json({ success: true });
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
  const { nome, area, cidade, anos_experiencia } = req.body;
  const userId = req.user.id;
  db.prepare(`
    INSERT OR REPLACE INTO user_profiles (user_id, nome, area, cidade, anos_experiencia, updated_at)
    VALUES (?, ?, ?, ?, ?, datetime('now'))
  `).run(userId, nome || null, area || null, cidade || null, anos_experiencia || null);
  res.json({ success: true });
});

// Ler perfil
app.get('/api/profile', authMiddleware, (req, res) => {
  const profile = db.prepare('SELECT * FROM user_profiles WHERE user_id = ?').get(req.user.id);
  res.json(profile || {});
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
  limits: { fileSize: 20 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = ['.txt', '.pdf', '.md', '.docx'];
    const ext = require('path').extname(file.originalname).toLowerCase();
    allowed.includes(ext) ? cb(null, true) : cb(new Error('Formato não suportado'));
  }
});

app.post('/api/conversation/upload', authMiddleware, uploadConv.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Arquivo não enviado' });
  
  let extractedText = '';
  const ext = require('path').extname(req.file.originalname).toLowerCase();
  
  try {
    if (ext === '.txt' || ext === '.md') {
      extractedText = fs.readFileSync(req.file.path, 'utf8');
    } else if (ext === '.pdf') {
      const pdfParse = require('pdf-parse');
      const buf = fs.readFileSync(req.file.path);
      const data = await pdfParse(buf);
      extractedText = data.text;
    } else if (ext === '.docx') {
      // Tenta ler como texto (fallback simples)
      extractedText = fs.readFileSync(req.file.path, 'utf8').replace(/[^\x20-\x7E\n\r\t\u00C0-\u024F]/g, ' ');
    }
    
    // Limita a 8000 chars para não explodir o contexto
    extractedText = extractedText.substring(0, 8000);
    
    const result = db.prepare(
      'INSERT INTO conversation_uploads (conversation_id, user_id, filename, original_name, file_path, extracted_text) VALUES (?, ?, ?, ?, ?, ?)'
    ).run(req.body.conversation_id || null, req.user.id, req.file.filename, req.file.originalname, req.file.path, extractedText);
    
    res.json({
      upload_id: result.lastInsertRowid,
      id: result.lastInsertRowid,
      name: req.file.originalname,
      original_name: req.file.originalname,
      extracted_length: extractedText.length,
      preview: extractedText.substring(0, 200) + '...'
    });
  } catch (e) {
    res.status(500).json({ error: 'Erro ao processar arquivo: ' + e.message });
  }
});

// ─── CHAT COM SUPORTE A DOCUMENTO ─────────────────────────────
// Extensão do /api/chat para aceitar upload_id
// (o upload_id é injetado no contexto como documento adicional)

// ─── FAVORITOS ───────────────────────────────────────────

app.post('/api/favorites', authMiddleware, (req, res) => {
  const { title, content } = req.body;
  if (!title || !content) return res.status(400).json({ error: 'Título e conteúdo obrigatórios' });
  const result = db.prepare('INSERT INTO favorites (user_id, title, content) VALUES (?, ?, ?)').run(req.user.id, title, content);
  res.json({ id: result.lastInsertRowid, title, content });
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
    'Fácil':  'Você é João, aposentado, curioso, já ouviu falar que pode revisar seu benefício. Tem 1-2 objeções simples (preço, tempo). É receptivo e educado.',
    'Médio':  'Você é Carlos, empresário, desconfiado, já gastou dinheiro com advogado que não entregou. Questiona honorários, pede garantias, compara preços. Tem 3-4 objeções.',
    'Difícil':'Você é Roberto, agressivo, foi enganado por advogado, desconfia de todos. Ataca o advogado, diz que é tudo golpe, extremamente difícil de convencer. Tem 5+ objeções pesadas.'
  };
  // aceita level numérico (1/2/3) ou textual ('Fácil'/'Médio'/'Difícil')
  const levelMap = { 1: 'Fácil', '1': 'Fácil', 2: 'Médio', '2': 'Médio', 3: 'Difícil', '3': 'Difícil' };
  const levelKey = personalities[level] ? level : (levelMap[level] || 'Médio');

  const userName = req.user?.name || 'o advogado';

  const gameSystemPrompt = `Você é um CLIENTE (não um assistente) num jogo de simulação de atendimento jurídico.
Nível: ${levelKey} — Área: ${area}
O advogado que está te atendendo se chama ${userName}. Use o nome dele quando se referir ao advogado.

${personalities[levelKey]}

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
        model: 'gpt-4o',
        messages: [{ role: 'system', content: gameSystemPrompt }, ...messages.slice(-20)],
        temperature: 0.8,
        max_tokens: 600
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

// ─── WEBHOOK PAGARME ─────────────────────────────────────────
const PAGARME_WEBHOOK_SECRET = process.env.PAGARME_WEBHOOK_SECRET || 'capi-pagarme-webhook-secret-2026';

app.post('/api/webhook/pagarme', express.raw({ type: 'application/json' }), (req, res) => {
  try {
    // Verificar assinatura (se configurada)
    const sig = req.headers['x-hub-signature'] || req.headers['x-pagarme-signature'];
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
              active = 1
            WHERE id = ?
          `).run(expiresAt.toISOString(), subscriptionId || null, user.id);

          console.log(`✅ Plano ativado para ${email}: ${isAnnual ? 'anual' : 'mensal'}, expira ${expiresAt.toISOString()}`);
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

// ─── ROTA: Status do plano do usuário ───────────────────────
app.get('/api/subscription/status', authMiddleware, (req, res) => {
  const user = db.prepare('SELECT plan_type, plan_expires_at, plan_activated_at FROM users WHERE id = ?').get(req.user.id);
  if (!user) return res.status(404).json({ error: 'Usuário não encontrado' });
  const access = hasActiveAccess({ ...user, email: req.user.email });
  res.json({
    plan_type: user.plan_type || 'free',
    plan_expires_at: user.plan_expires_at,
    plan_activated_at: user.plan_activated_at,
    has_access: access !== false,
    is_active: access === true || access === 'free',
    redirect_url: access === false ? 'https://capicand-ia.com#planos' : null
  });
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

app.post('/api/admin/revoke-access', adminMiddleware, (req, res) => {
  const { user_id } = req.body;
  if (!user_id) return res.status(400).json({ error: 'user_id obrigatório' });
  db.prepare(`UPDATE users SET plan_type = 'free', plan_expires_at = NULL WHERE id = ?`).run(user_id);
  res.json({ ok: true });
});

// ─── CHECKOUT REDIRECT ──────────────────────────────────────
// Redireciona para PagarMe quando tiver a integração configurada
app.get('/checkout', (req, res) => {
  const plan = req.query.plan || 'monthly';
  // URLs do PagarMe serão configuradas via env vars
  const PAGARME_MONTHLY_URL = process.env.PAGARME_MONTHLY_URL || 'https://link.pagar.me/capi-candia-mensal';
  const PAGARME_ANNUAL_URL = process.env.PAGARME_ANNUAL_URL || 'https://link.pagar.me/capi-candia-anual';
  const url = plan === 'annual' ? PAGARME_ANNUAL_URL : PAGARME_MONTHLY_URL;
  res.redirect(302, url);
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

// Serve arquivos estáticos (CSS, JS, imagens) — após todas as rotas de API
app.use(express.static(path.join(__dirname, '../frontend')));

// Catch-all SPA — deve ficar após todas as rotas de API
app.get('/{*path}', (req, res) => {
  res.sendFile(path.join(__dirname, '../frontend/index.html'));
});

// ─── TEXT-TO-SPEECH (ElevenLabs) ─────────────────────────────
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
    res.set('Content-Type', 'audio/mpeg');
    res.set('Content-Length', audioBuffer.byteLength);
    res.send(Buffer.from(audioBuffer));
  } catch (e) {
    console.error('TTS erro:', e.message);
    res.status(500).json({ error: 'Erro interno TTS' });
  }
});

app.listen(PORT, () => console.log(`✅ Capi Când-IA Pro rodando na porta ${PORT}`));
