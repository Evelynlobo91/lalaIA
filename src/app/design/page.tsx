import type { Metadata } from "next";
import { notFound } from "next/navigation";

export const metadata: Metadata = { title: "LalaIA prototype", robots: { index: false } };

const cards = [
  { label: "Login ...", variant: "login-a" },
  { label: "Login ...", variant: "login-b" },
  { label: "Início", variant: "home" },
  { label: "Explorar", variant: "explore" },
  { label: "Experi...", variant: "experience" },
  { label: "Detalh...", variant: "detail" },
  { label: "Mapa ...", variant: "map" },
  { label: "Painel ...", variant: "panel-a" },
  { label: "Painel ...", variant: "panel-b" },
  { label: "Painel ...", variant: "panel-c" },
  { label: "Config...", variant: "config" },
  { label: "Result...", variant: "results" },
  { label: "Perfil", variant: "profile" },
  { label: "Final", variant: "final" },
];

export default function DesignPage() {
  if (process.env.NODE_ENV === "production") notFound();

  return (
    <main className="prototype-page">
      <div className="prototype-grid">
        {cards.map((card) => (
          <div key={`${card.label}-${card.variant}`} className="phone-slot">
            <span className="phone-label">{card.label}</span>
            <div className={`phone-card ${card.variant}`}>
              {card.variant === "login-a" && <LoginCardA />}
              {card.variant === "login-b" && <LoginCardB />}
              {card.variant === "home" && <HomeCard />}
              {card.variant === "explore" && <ExploreCard />}
              {card.variant === "experience" && <ExperienceCard />}
              {card.variant === "detail" && <DetailCard />}
              {card.variant === "map" && <MapCard />}
              {card.variant === "panel-a" && <PanelCardA />}
              {card.variant === "panel-b" && <PanelCardB />}
              {card.variant === "panel-c" && <PanelCardC />}
              {card.variant === "config" && <ConfigCard />}
              {card.variant === "results" && <ResultsCard />}
              {card.variant === "profile" && <ProfileCard />}
              {card.variant === "final" && <FinalCard />}
            </div>
          </div>
        ))}
      </div>
    </main>
  );
}

function LoginCardA() {
  return (
    <div className="card-shell shell-light">
      <div className="mini-header">
        <span className="dot" />
        <span className="dot" />
        <span className="dot" />
      </div>
      <div className="login-hero" />
      <div className="login-title">Vai joindre de um jeito novo.</div>
      <button className="primary-button">Comece agora</button>
      <div className="login-section">
        <div className="login-item">
          <span className="pill small">Hoje</span>
          <strong>Como começar</strong>
        </div>
        <div className="login-item">
          <span className="pill small gray">12 min</span>
          <strong>Rotina</strong>
        </div>
      </div>
    </div>
  );
}

function LoginCardB() {
  return (
    <div className="card-shell shell-light">
      <div className="mini-header">
        <span className="dot" />
        <span className="dot" />
        <span className="dot" />
      </div>
      <div className="card-headline">Oi, Beatriz!</div>
      <div className="card-subtitle">Seu perfil está pronto para receber recomendações.</div>
      <div className="soft-box">
        <div className="soft-box-header">
          <span className="badge blue">Live</span>
          <span className="tiny">18:00</span>
        </div>
        <div className="soft-box-figure" />
      </div>
      <button className="primary-button">Entrar</button>
    </div>
  );
}

function HomeCard() {
  return (
    <div className="card-shell shell-light">
      <div className="mini-header">
        <span className="dot" />
        <span className="dot" />
        <span className="dot" />
      </div>
      <div className="home-header">
        <span>Início</span>
        <div className="avatar mini"></div>
      </div>
      <div className="big-photo" />
      <div className="event-row">
        <div>
          <h4>Oi, Beatriz</h4>
          <small>Seu agenda está carregada</small>
        </div>
        <span className="chip">Hoje</span>
      </div>
      <div className="mini-cards">
        <div className="mini-stat">
          <strong>12</strong>
          <span>Eventos</span>
        </div>
        <div className="mini-stat">
          <strong>7</strong>
          <span>Favoritos</span>
        </div>
      </div>
    </div>
  );
}

function ExploreCard() {
  return (
    <div className="card-shell shell-light">
      <div className="mini-header">
        <span className="dot" />
        <span className="dot" />
        <span className="dot" />
      </div>
      <div className="home-header">
        <span>Explorar</span>
        <span className="tiny">Rio</span>
      </div>
      <div className="search-box">Buscar lugares e eventos</div>
      <div className="feature-grid">
        <div className="feature-tile tall" />
        <div className="feature-tile" />
        <div className="feature-tile" />
        <div className="feature-tile" />
      </div>
      <button className="primary-button small">Ver mais</button>
    </div>
  );
}

function ExperienceCard() {
  return (
    <div className="card-shell shell-light">
      <div className="mini-header">
        <span className="dot" />
        <span className="dot" />
        <span className="dot" />
      </div>
      <div className="title-strip">
        <span>Experiência</span>
        <span className="featured-tag">+50 XP</span>
      </div>
      <div className="media-card" />
      <div className="text-stack">
        <strong>Festival de dança</strong>
        <span>Centro de convenções</span>
      </div>
      <div className="progress-line">
        <span />
      </div>
    </div>
  );
}

function DetailCard() {
  return (
    <div className="card-shell shell-light">
      <div className="mini-header">
        <span className="dot" />
        <span className="dot" />
        <span className="dot" />
      </div>
      <div className="detail-photo" />
      <div className="info-block">
        <div className="title-strip">
          <strong>Casarão da Praia</strong>
          <span className="tag rose">Novo</span>
        </div>
        <span className="small-text">2 km • Aberto até 23h</span>
      </div>
      <div className="meta-row">
        <span>Fotos</span>
        <span>Mapa</span>
        <span>Comentar</span>
      </div>
    </div>
  );
}

function MapCard() {
  return (
    <div className="card-shell shell-light map-shell">
      <div className="mini-header">
        <span className="dot" />
        <span className="dot" />
        <span className="dot" />
      </div>
      <div className="map-grid" />
      <div className="map-pin pin-a" />
      <div className="map-pin pin-b" />
      <div className="map-pin pin-c" />
      <div className="map-legend">
        <span>Mapa</span>
        <span className="circle blue" />
      </div>
    </div>
  );
}

function PanelCardA() {
  return (
    <div className="card-shell shell-light">
      <div className="mini-header">
        <span className="dot" />
        <span className="dot" />
        <span className="dot" />
      </div>
      <div className="panel-top">
        <strong>Meu painel</strong>
        <span className="chip accent">+12%</span>
      </div>
      <div className="stats-boxes">
        <div><strong>18</strong><span>Atividades</span></div>
        <div><strong>7</strong><span>Check-ins</span></div>
      </div>
      <div className="bars">
        <span style={{ height: "36%" }} />
        <span style={{ height: "62%" }} />
        <span style={{ height: "52%" }} />
        <span style={{ height: "82%" }} />
      </div>
    </div>
  );
}

function PanelCardB() {
  return (
    <div className="card-shell shell-light">
      <div className="mini-header">
        <span className="dot" />
        <span className="dot" />
        <span className="dot" />
      </div>
      <div className="panel-top">
        <strong>Crédito</strong>
        <span className="tag green">Ativo</span>
      </div>
      <div className="money-box">R$ 2.400</div>
      <div className="row-list">
        <span>Mercados</span>
        <span>R$ 1.200</span>
      </div>
      <div className="row-list">
        <span>Eventos</span>
        <span>R$ 980</span>
      </div>
    </div>
  );
}

function PanelCardC() {
  return (
    <div className="card-shell shell-light">
      <div className="mini-header">
        <span className="dot" />
        <span className="dot" />
        <span className="dot" />
      </div>
      <div className="panel-top">
        <strong>Resultados</strong>
        <span className="chip">30%</span>
      </div>
      <div className="result-box">
        <div className="donut" />
        <div className="legend">
          <span>Concluído</span>
          <span>76%</span>
        </div>
      </div>
    </div>
  );
}

function ConfigCard() {
  return (
    <div className="card-shell shell-light">
      <div className="mini-header">
        <span className="dot" />
        <span className="dot" />
        <span className="dot" />
      </div>
      <div className="config-form">
        <div className="config-row">
          <span>Nome</span>
          <span className="muted">maria.gobbi</span>
        </div>
        <div className="config-row">
          <span>Email</span>
          <span className="muted">maria@lalaia.com</span>
        </div>
        <div className="config-row">
          <span>Preferências</span>
          <span className="muted">Ativas</span>
        </div>
      </div>
      <button className="primary-button small">Salvar</button>
    </div>
  );
}

function ResultsCard() {
  return (
    <div className="card-shell shell-light">
      <div className="mini-header">
        <span className="dot" />
        <span className="dot" />
        <span className="dot" />
      </div>
      <div className="results-header">
        <strong>Suas conquistas</strong>
      </div>
      <div className="results-list">
        <div>⭐ Museus 12</div>
        <div>🎉 Festivais 8</div>
        <div>🧭 Exploração 92%</div>
      </div>
    </div>
  );
}

function ProfileCard() {
  return (
    <div className="card-shell shell-light profile-shell">
      <div className="mini-header">
        <span className="dot" />
        <span className="dot" />
        <span className="dot" />
      </div>
      <div className="profile-top">
        <div className="avatar big" />
        <div className="profile-info">
          <strong>Maria Gobbi</strong>
          <span>Rio de Janeiro</span>
        </div>
      </div>
      <div className="stats-boxes small-grid">
        <div><strong>24</strong><span>Eventos</span></div>
        <div><strong>84%</strong><span>XP</span></div>
      </div>
      <div className="mini-list">
        <span>Conquistas</span>
        <span>Veja tudo</span>
      </div>
    </div>
  );
}

function FinalCard() {
  return (
    <div className="card-shell shell-light final-shell">
      <div className="mini-header">
        <span className="dot" />
        <span className="dot" />
        <span className="dot" />
      </div>
      <div className="final-cta">
        <span className="brand-fade">LalaIA</span>
        <strong>Exploração personalizada</strong>
      </div>
      <div className="final-pills">
        <span>Eventos</span>
        <span>Mapa</span>
        <span>Favoritos</span>
      </div>
      <button className="primary-button small">Continuar</button>
    </div>
  );
}
