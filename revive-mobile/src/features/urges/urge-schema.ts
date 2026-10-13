import { z } from 'zod';
import { validTimezone } from '@/domain/urge-time';

const optionalText = z.string().trim().max(1000, 'Use ate 1000 caracteres por campo.').nullable().optional();
export const urgeSchema = z.object({
  vicio_id: z.string().min(1, 'Selecione um habito.'),
  occurred_at: z.string().refine(value => /(Z|[+-]\d{2}:\d{2})$/i.test(value) && Number.isFinite(new Date(value).getTime()), 'Informe um momento valido com fuso.')
    .refine(value => new Date(value).getTime() <= Date.now() + 300000, 'O momento nao pode estar mais de cinco minutos no futuro.'),
  timezone: z.string().refine(validTimezone, 'Informe um fuso IANA valido.'),
  intensidade: z.number().int('Use um número inteiro de 0 a 10.').min(0, 'Use um número inteiro de 0 a 10.').max(10, 'Use um número inteiro de 0 a 10.'),
  gatilhos: z.array(z.string().regex(/^[a-z][a-z0-9_]{0,39}$/)).max(10).refine(codes => new Set(codes).size === codes.length).default([]),
  nota: optionalText, acao_realizada: optionalText, resultado: optionalText,
}).strict();
