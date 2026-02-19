import { Component, ChangeDetectorRef } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { DashboardComponent } from './dashboard/dashboard'; 

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [FormsModule, DashboardComponent], 
  templateUrl: './app.html',
  styleUrl: './app.css'
})
export class App {
  usuario = '';
  password = '';
  sesionIniciada = false; 
  cargando = false; 

  // ✨ AÑADIDO: ChangeDetectorRef para forzar a la pantalla a actualizarse
  constructor(private http: HttpClient, private cdr: ChangeDetectorRef) {}

  iniciarSesion() {
    this.cargando = true; 
    console.log("⏳ Iniciando petición de login..."); // Chivato en consola

    const paqueteDatos = { usuario: this.usuario, password: this.password };

    this.http.post('https://medicloud-backend-tuug.onrender.com/api/login', paqueteDatos).subscribe({
      next: (respuestaDelServidor: any) => {
        localStorage.setItem('token_medicloud', respuestaDelServidor.token);
        this.sesionIniciada = true; 
        this.cargando = false; 
        console.log("✅ Login exitoso. Respuesta:", respuestaDelServidor);
        this.cdr.detectChanges(); // Forzamos actualización visual
      },
      error: (errorDelServidor) => {
        this.cargando = false; 
        this.cdr.detectChanges(); // Forzamos actualización visual
        
        // Comprobamos si el error es por nuestro Rate Limit (fuerza bruta)
        if (errorDelServidor.status === 429) {
          alert('⛔ DEMASIADOS INTENTOS: Por seguridad, tu IP ha sido bloqueada. Inténtalo más tarde.');
        } else {
          alert('⛔ ERROR: ' + (errorDelServidor.error?.error || 'Usuario o contraseña incorrectos'));
        }
      },
      complete: () => {
        // Por si acaso la petición termina pero no entra ni en next ni en error
        this.cargando = false;
        this.cdr.detectChanges();
      }
    });
  }

  finalizarSesion() {
    this.sesionIniciada = false;
    this.usuario = '';
    this.password = '';
    console.log("🔒 Sesión finalizada en App");
    this.cdr.detectChanges();
  }
}