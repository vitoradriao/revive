import React, { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { BarChart3, Clock, Star, TrendingUp } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useUI } from '../contexts/UIContext';
import Alert from '../components/ui/Alert';
import { InputField } from '../components/ui/Field';
import Button from '../components/ui/Button';

export default function LoginPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { login, cadastro } = useAuth();
  const { alert, setAlert, showToast } = useUI();
  const [view, setView] = useState('login');
  const [loading, setLoading] = useState(false);
  const [formLogin, setFormLogin] = useState({ email: '', senha: '' });
  const [formCadastro, setFormCadastro] = useState({ nome: '', email: '', senha: '' });

  const handleLogin = async (event) => {
    event.preventDefault();
    setLoading(true);
    try {
      await login(formLogin.email, formLogin.senha);
      setFormLogin({ email: '', senha: '' });
      navigate('/');
    } catch (error) {
      showToast('error', error.message || 'Erro ao fazer login');
    } finally {
      setLoading(false);
    }
  };

  const handleCadastro = async (event) => {
    event.preventDefault();
    setLoading(true);
    try {
      const data = await cadastro(formCadastro.nome, formCadastro.email, formCadastro.senha);
      setFormCadastro({ nome: '', email: '', senha: '' });
      if (data?.token) {
        navigate('/');
      } else {
        setView('login');
      }
    } catch (error) {
      showToast('error', error.message || 'Erro ao cadastrar');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen p-4 sm:p-6 flex items-center justify-center">
      <main className="w-full max-w-6xl grid lg:grid-cols-[1.05fr_.95fr] gap-5">
        <section className="revive-hero min-h-[620px] p-8 sm:p-10 flex flex-col justify-between">
          <div className="relative z-[1]">
            <div className="w-14 h-14 rounded-[18px] bg-[var(--accent)] text-[#121212] grid place-items-center mb-8">
              <BarChart3 className="w-7 h-7" />
            </div>
            <p className="revive-tag">Jornada de autocuidado</p>
            <h1 className="mt-7 max-w-2xl text-[clamp(3.2rem,8vw,6.8rem)] font-black leading-[0.86] tracking-[-0.085em] text-white">
              Revive
            </h1>
            <p className="mt-6 max-w-xl text-lg leading-8 text-white/60">
              Um painel vivo para acompanhar progresso, humor, economia, metas e pequenos marcos da sua rotina.
            </p>
          </div>

          <div className="relative z-[1] grid gap-3">
            {[
              { icon: TrendingUp, text: 'Acompanhe economia, dias limpos e metas em um so lugar' },
              { icon: Clock, text: 'Registre humor, gatilhos e conquistas com poucos toques' },
              { icon: Star, text: 'Veja calendario, conquistas e insights personalizados' }
            ].map((item) => {
              const Icon = item.icon;
              return (
                <div key={item.text} className="rounded-[24px] border border-white/10 bg-white/[0.055] p-4 flex items-center gap-3 backdrop-blur">
                  <div className="w-10 h-10 rounded-[16px] bg-[var(--accent)]/15 text-[var(--accent)] grid place-items-center">
                    <Icon className="w-5 h-5" />
                  </div>
                  <p className="text-sm font-bold leading-6 text-white/62">{item.text}</p>
                </div>
              );
            })}
          </div>
        </section>

        <section className="surface-card rounded-[38px] p-7 sm:p-10 flex flex-col justify-center">
          <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between mb-8">
            <div>
              <p className="eyebrow">Acesso</p>
              <h2 className="mt-2 text-4xl font-black leading-[0.95] tracking-[-0.07em] text-app">
                {view === 'login' ? 'Bem-vindo de volta' : 'Crie sua conta'}
              </h2>
            </div>
            <div className="surface-sand rounded-full p-1 flex gap-1">
              <button
                type="button"
                onClick={() => setView('login')}
                className={`px-4 py-2 rounded-full text-sm font-black transition ${
                  view === 'login' ? 'bg-[#121212] text-[#fbfaf5]' : 'text-muted hover:text-app'
                }`}
              >
                Entrar
              </button>
              <button
                type="button"
                onClick={() => setView('cadastro')}
                className={`px-4 py-2 rounded-full text-sm font-black transition ${
                  view === 'cadastro' ? 'bg-[#121212] text-[#fbfaf5]' : 'text-muted hover:text-app'
                }`}
              >
                Criar conta
              </button>
            </div>
          </div>

          {location.state?.accountDeleted && <p role="status">Conta excluída. Os dados e as pendências deste navegador foram removidos.</p>}
          {location.state?.passwordReset && <p role="status">Senha redefinida. Entre com a nova senha. As sessões anteriores foram encerradas.</p>}
          {alert && <Alert type={alert.type} onClose={() => setAlert(null)}>{alert.message}</Alert>}

          {view === 'login' ? (
            <form onSubmit={handleLogin} className="space-y-4">
              <InputField
                type="email"
                required
                label="Email"
                value={formLogin.email}
                onChange={(event) => setFormLogin({ ...formLogin, email: event.target.value })}
                placeholder="seu@email.com"
              />
              <InputField
                type="password"
                required
                label="Senha"
                value={formLogin.senha}
                onChange={(event) => setFormLogin({ ...formLogin, senha: event.target.value })}
                placeholder="********"
              />
              <Button type="submit" disabled={loading} variant="primary" size="lg" className="w-full">
                {loading ? 'Entrando...' : 'Entrar e continuar'}
              </Button>
              <Link className="block text-center font-bold underline" to="/recuperar-senha">Esqueci minha senha</Link>
            </form>
          ) : (
            <form onSubmit={handleCadastro} className="space-y-4">
              <InputField
                type="text"
                required
                label="Nome"
                value={formCadastro.nome}
                onChange={(event) => setFormCadastro({ ...formCadastro, nome: event.target.value })}
                placeholder="Como quer ser chamado?"
              />
              <InputField
                type="email"
                required
                label="Email"
                value={formCadastro.email}
                onChange={(event) => setFormCadastro({ ...formCadastro, email: event.target.value })}
                placeholder="seu@email.com"
              />
              <InputField
                type="password"
                required
                minLength={6}
                autoComplete="new-password"
                label="Senha"
                hint="Use no minimo 6 caracteres, uma letra maiuscula e um caractere especial."
                value={formCadastro.senha}
                onChange={(event) => setFormCadastro({ ...formCadastro, senha: event.target.value })}
                placeholder="Defina uma senha segura"
              />
              <Button type="submit" disabled={loading} variant="primary" size="lg" className="w-full">
                {loading ? 'Criando...' : 'Criar conta'}
              </Button>
              <button type="button" onClick={() => setView('login')} className="w-full text-muted hover:text-app font-black">
                Ja tenho uma conta
              </button>
            </form>
          )}
        </section>
      </main>
    </div>
  );
}
