import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { HashRouter, Navigate, Route, Routes } from "react-router-dom";
import { Moldura } from "./componentes/Moldura";
import { Calendario } from "./paginas/Calendario";
import { Conteudo } from "./paginas/Conteudo";
import { Dia } from "./paginas/Dia";
import { Referencia } from "./paginas/Referencia";
import { Referencias } from "./paginas/Referencias";
import { Roteiro } from "./paginas/Roteiro";
import { Avaliar } from "./paginas/Avaliar";
import { Radar } from "./paginas/Radar";
import { Trilhas } from "./paginas/Trilhas";
import { Laboratorio } from "./paginas/Laboratorio";
import "./estilo.css";

createRoot(document.getElementById("raiz")!).render(
  <StrictMode>
    <HashRouter>
      <Routes>
        <Route element={<Moldura />}>
          <Route index element={<Calendario />} />
          <Route path="dia/:numero" element={<Dia />} />
          <Route path="conteudo" element={<Conteudo />} />
          <Route path="referencias" element={<Referencias />} />
          <Route path="referencias/:slug" element={<Referencia />} />
          <Route path="roteiro" element={<Roteiro />} />
          <Route path="avaliar" element={<Avaliar />} />
          <Route path="radar" element={<Radar />} />
          <Route path="trilhas" element={<Trilhas />} />
          <Route path="laboratorio" element={<Laboratorio />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </HashRouter>
  </StrictMode>,
);
