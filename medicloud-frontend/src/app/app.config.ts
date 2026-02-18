import { ApplicationConfig } from '@angular/core';
import { provideRouter } from '@angular/router';
import { routes } from './app.routes';
import { provideHttpClient } from '@angular/common/http'; // <-- Importamos el "teléfono"

export const appConfig: ApplicationConfig = {
  // Metemos provideHttpClient() en la lista de proveedores
  providers: [provideRouter(routes), provideHttpClient()] 
};