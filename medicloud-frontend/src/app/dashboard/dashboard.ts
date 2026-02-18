import { Component, OnInit, ChangeDetectorRef } from '@angular/core'; // <-- Importamos el despertador
import { HttpClient, HttpHeaders } from '@angular/common/http';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  templateUrl: './dashboard.html',
  styleUrl: './dashboard.css'
})
export class DashboardComponent implements OnInit {
  carpetas: any[] = []; 
  mensajeServidor = '';

  // 1. Inyectamos el "Despertador" (cdr) en el constructor
  constructor(private http: HttpClient, private cdr: ChangeDetectorRef) {}

  ngOnInit() {
    this.cargarCarpetas();
  }

  cargarCarpetas() {
    const token = localStorage.getItem('token_medicloud');
    const cabecerasSeguras = new HttpHeaders().set('Authorization', `Bearer ${token}`);

    this.http.get('http://localhost:3000/api/carpetas', { headers: cabecerasSeguras }).subscribe({
      next: (respuesta: any) => {
        console.log('🕵️‍♂️ DATOS DEL SERVIDOR:', respuesta); 
        
        this.mensajeServidor = respuesta.mensaje;
        this.carpetas = respuesta.carpetas; 

        // 2. ⏰ ¡HACEMOS SONAR EL DESPERTADOR PARA QUE PINTE LA PANTALLA!
        this.cdr.detectChanges(); 
      },
      error: (error) => {
        alert('⛔ Error al entrar a la bóveda: ' + error.message);
      }
    });
  }
  // ... (aquí arriba está tu función cargarCarpetas) ...

  cerrarSesion() {
    // 1. Destruimos el Pase VIP del bolsillo del navegador
    localStorage.removeItem('token_medicloud');
    
    // 2. Recargamos la página para que el "Interruptor" vuelva a apagarse
    window.location.reload();
  }
  // --- AÑADE ESTO AQUÍ ---
  abrirCarpeta(ruta: string) {
    console.log('🔗 Intentando abrir la ruta:', ruta);

    if (ruta && ruta.startsWith('http')) {
      // Abre el PDF de Supabase en una pestaña nueva
      window.open(ruta, '_blank');
    } else {
      console.warn('⚠️ La ruta no es válida:', ruta);
      alert('Esta carpeta no tiene un archivo digital asignado o la ruta es incorrecta.');
    }
  }
} // <-- Esta es la última llave de tu archivo


