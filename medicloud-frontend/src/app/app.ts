import { Component } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { DashboardComponent } from './dashboard/dashboard'; // <-- Importamos la nueva pantalla

@Component({
  selector: 'app-root',
  imports: [FormsModule, DashboardComponent], // <-- Le decimos a Angular que la use aquí
  templateUrl: './app.html',
  styleUrl: './app.css'
})
export class App {
  usuario = '';
  password = '';
  sesionIniciada = false; // 💡 NUESTRO INTERRUPTOR MÁGICO (Apagado por defecto)

  constructor(private http: HttpClient) {}

  iniciarSesion() {
    const paqueteDatos = { usuario: this.usuario, password: this.password };

    this.http.post('http://localhost:3000/api/login', paqueteDatos).subscribe({
      next: (respuestaDelServidor: any) => {
        // 1. Guardamos el pase VIP en el bolsillo
        localStorage.setItem('token_medicloud', respuestaDelServidor.token);
        
        // 2. 💡 ¡ENCENDEMOS EL INTERRUPTOR!
        this.sesionIniciada = true; 
      },
      error: (errorDelServidor) => {
        alert('⛔ ERROR: ' + errorDelServidor.error.error);
      }
    });
  }
}