const express = require('express');
const router = express.Router();
const path = require('path');

const pool = require('../database');
const {
    isLoggedIn
} = require('../lib/auth');

// Modificar esta ruta para visualizar las facturas
router.get('/', isLoggedIn, async (req, res) => {
    const facturas = await pool.query('SELECT * FROM facturas ORDER BY id_facturas DESC');
    facturas.forEach(factura => {
        var f = new Date(factura.fecha_timbrado);
        var meses = new Array("Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre");

        factura.fecha_timbrado = (f.getDate() + " de " + meses[f.getMonth()] + " de " + f.getFullYear() + " a las " + f.getHours() + ":" + f.getMinutes());

    });
    res.render('facturas/listar', {
        facturas
    });
});

router.get('/individual', isLoggedIn, async (req, res) => {
    const empleados = await pool.query('SELECT * FROM empleados ORDER BY nombres ASC');
    res.render('facturas/individual', {
        empleados
    });
});

router.post('/getEmpleado', isLoggedIn, async (req, res) => {
    const {
        id_empleado
    } = req.body;
    const empleado = await pool.query('SELECT * FROM empleados WHERE id_empleado = ?', [id_empleado]);

    res.send(empleado);
});

router.get('/correo/:id', isLoggedIn, async (req, res) => {
    const {
        id
    } = req.params;

    const factura = await pool.query('SELECT * FROM facturas WHERE id_facturas = ?', [id]);
    const ruta_pdf_correo = path.join(__dirname, '..', 'public', 'public', factura[0].ruta_pdf);

    // Re enviar correo
    var nodemailer = require('nodemailer');

    var transporter = nodemailer.createTransport({
        service: 'gmail',
        auth: {
            user: 'juanca0510.jcz@gmail.com',
            pass: 'twqccuesmcpzluwe'
        }
    });

    var mailOptions = {
        from: 'juanca0510.jcz@gmail.com',
        to: factura[0].email,
        subject: '[G-FACT] Recibo de nomina (Re enviado)',
        text: `Hola estimado ${factura[0].nombre_completo_empleado}, El presente correo contiene anexo su comprobante fiscal digital por internet.`,
        attachments: [{
            path: ruta_pdf_correo
        }]
    };

    transporter.sendMail(mailOptions, function (error, info) {
        if (error) {
            console.log(error);
        } else {
            console.log('Email sent: ' + info.response);
        }
    });

    req.flash('success', 'Correo re enviado');
    res.redirect('/facturas');
});

router.post('/facturar', isLoggedIn, async (req, res) => {
    const {
        id_empleado,
        nombre_completo_empleado,
        sueldo_diario,
        inicio_periodo,
        fin_periodo,
        otros_pagos,
        faltas,
        retardos,
        correo
    } = req.body;

    var d1 = new Date(inicio_periodo);
    var d2 = new Date(fin_periodo);
    var tiempoDiferencia = d2.getTime() - d1.getTime();
    var diasTrabajados = (tiempoDiferencia / (1000 * 3600 * 24)) + 1;

    // Convertir variables de string a numeros
    var aux_diasTrabajados = diasTrabajados != '' ? parseInt(diasTrabajados, 10) : 0;
    var aux_horasExtra = otros_pagos != '' ? parseInt(otros_pagos, 10) : 0;
    var aux_faltas = faltas != '' ? parseInt(faltas, 10) : 0;
    var aux_retardos = retardos != '' ? parseInt(retardos, 10) : 0;

    // Calcular sueldo neto
    var sueldoBruto = diasTrabajados * sueldo_diario;
    var montoHorasExtra = ( (sueldo_diario / 8) * aux_horasExtra) * 2;
    var montoFaltas = sueldo_diario * aux_faltas;
    var montoRetardos = Math.floor(aux_retardos/3) * sueldo_diario;
    var montoBonoPuntualidad = (aux_retardos == 0 && aux_faltas == 0) ? sueldoBruto * 0.02 : 0;
    var sueldo_neto = ( ((sueldoBruto) + (montoHorasExtra)) - (montoFaltas + montoRetardos) + montoBonoPuntualidad);

    var cuota_imss = (sueldo_neto * 0.06);
    sueldo_neto = (sueldo_neto - cuota_imss);

    // Crear PDF
    const empleado = await pool.query('SELECT * FROM empleados WHERE id_empleado = ?', [id_empleado]);
    console.log('el empleado es: ', empleado);
    var pdf = require('html-pdf');
    var varDate = new Date();
    varDate = varDate.toDateString();
    var ruta_archivo_pdf = path.join(__dirname, '..', 'public', 'pdf', nombre_completo_empleado, 'FACTURA_NOMINA_' + varDate + '.pdf');

    // Variables para PDF
    var horasExtra_table = '';
    if (otros_pagos != '') {
        horasExtra_table = `
        <tr>
            <td>Horas extra (${aux_horasExtra} hrs)</td>
            <td><p style="text-align: right;">$${montoHorasExtra}</p></td>
        </tr>`;
    }

    var faltas_table = '';
    if (faltas != '') {
        faltas_table = `
        <tr>
            <td>Faltas (${aux_faltas})</td>
            <td><p style="text-align: right;">$${montoFaltas}</p></td>
        </tr>`;
    }

    var retardos_table = '';
    if (retardos != '') {
        retardos_table = `
        <tr>
            <td>Retardos (${aux_retardos})</td>
            <td><p style="text-align: right;">$${montoRetardos}</p></td>
        </tr>`;
    }

    var bonoPuntualidad_table = '';
    if (montoBonoPuntualidad > 0) {
        bonoPuntualidad_table = `
        <tr>
            <td>Bono de puntualidad y asistencia</td>
            <td><p style="text-align: right;">$${montoBonoPuntualidad}</p></td>
        </tr>`;
    }

    var ruta_img = path.join('file://', __dirname, '..', 'public', 'img', 'genesis.png');
    console.log('ruta img: ', ruta_img);
    var contenido = `
    <table>
    <tr style="font-size: 15px; font-weight: bold;">
        <td><img src="${ruta_img}" width="50%"/></td>
        <td><center style="font-size: 8px;">
        GENESIS APLICACIONES S.A. DE C.V. <br>
        GAP130208C85 <br>
        <p style="font-weight: normal;">42 x 47, 298-A, Francisco de Montejo, 97203, Mérida, Yucatán, México <br>
        General de Ley Personas Morales (601) </p>
        </center></td>
        <td><p style="text-align: right">FACTURA DE NOMINA</p></td>
    </tr>
    </table>
    <br>
    <hr>
    <table style="width: 100%; font-size: 8px;">
    <tr style="text-align: center;">
        <td>N° emp: ${id_empleado}</td>
        <td>${nombre_completo_empleado}</td>
        <td>RFC: ${empleado[0].rfc}</td>
        <td>IMSS: ${empleado[0].seguro_social}</td>
    </tr>
    <tr style="text-align: center;">
        <td>CURP: ${empleado[0].curp}</td>
        <td>PUESTO: ${empleado[0].puesto}</td>
        <td>DEPARTAMENTO: ${empleado[0].departamento}</td>
        <td>REGIMEN TRABAJADOR: Sueldos y salarios</td>
    </tr>
    <tr style="text-align: center;">
        <td>Dias pagados: ${diasTrabajados}</td>
        <td>Periocidad de pago: Quincenal</td>
        <td>Inicio periodo de pago:${inicio_periodo.toString().split("T").slice(0, 1).join(" ")}</td>
        <td>Fin periodo de pago: ${fin_periodo.toString().split("T").slice(0, 1).join(" ")}</td>
    </tr>
    </table>
    <hr>
    <br>
    <table style="width: 47%; font-size: 10px; display: inline;">
    <tr style="background:black; color:white; font-size: 12px;">
        <th style="width: 100%; font-weight: bold" colspan="2">PERCEPCIONES</th>
    </tr>
    <tr>
        <td><p style="font-weight: bold;">Concepto</p></td>
        <td><p style="text-align: right; font-weight: bold;">Importe</p></td>
    </tr>
    <tr>
        <td>Sueldos, Salarios Rayas y Jornales</td>
        <td><p style="text-align: right;">$${(sueldo_diario * aux_diasTrabajados)}</p></td>
    </tr>
    ${bonoPuntualidad_table}
    ${horasExtra_table}
    <tr>
        <td><p style="font-weight: bold">TOTAL PERSEPCIONES</p></td>
        <td><p style="text-align: right;">$${(sueldo_diario * aux_diasTrabajados) + (montoHorasExtra) + (montoBonoPuntualidad)}</p></td>
    </tr>

    
    </table>
    <table style="width: 47%; font-size: 10px; display: inline; margin-left: 4%">
    <tr style="background:black; color:white; font-size: 12px;">
        <th style="width: 100%; font-weight: bold" colspan="2">DEDUCCIONES</th>
    </tr>
    <tr>
        <td><p style="font-weight: bold;">Concepto</p></td>
        <td><p style="text-align: right; font-weight: bold;">Importe</p></td>
    </tr>
     <tr>
        <td>Seguridad Social</td>
        <td><p style="text-align: right;">$${cuota_imss}</p></td>
    </tr>
    ${retardos_table}
    ${faltas_table}
    <tr>
        <td><p style="font-weight: bold">TOTAL DEDUCCIONES</p></td>
        <td><p style="text-align: right;">$${(cuota_imss) + (montoRetardos) + (montoFaltas)}</p></td>
    </tr>
    </table>
    <br>
    <br>
    <hr>
    <table>
        <tr>
            <td><p style="font-weight: bold">NETO A PAGAR</p></td>
            <td><p style="text-align: right;">$${((sueldo_diario * aux_diasTrabajados) + (montoHorasExtra + montoBonoPuntualidad)) - ((cuota_imss) + (montoRetardos) + (montoFaltas))}</p></td>
        </tr>
    </table>
    <br>
    <br>
    <br>

    <div style="font-size: 8px;">
    <p>No. Serie del CSD del SAT: <b>00001000000407657133</b></p>
    <p>PAC: <b>GYS1010015I2</b></p>
    <p>Fecha Certificación: <b>${varDate}</b></p>
    <p>Sello Digital del Emisor: <b>C4o7sTOqaZnsXkoAfxhorO4UqTQnDlUd1Bq6GFMGTojlx2oYIp40D2RoJpvrIuPbsh+0mZ1nEaXs6AWOvvcL9KdvbrqhSyIRCvw6Q5DWUXVDMh89w/oW+U7ISlnQUypDMSgAmMtGQSJEhO5FIdjXW/VTRfhoBP+mIdKV9CaCLoneaATKFxQtNBTFjuT5OIJ49k+FyMOiqNdbVs4nG/r7hnSqcBuWqKkEkL+zeQdGwy/pbyqOAw6j5oTn5E+o7Djo8tEAVkkUrue1jXhw6LeB9jQw913WvXvr31gR8ZKMSrkHYsrgkq9k2Jcj5j3HOGLcJIPSAJ8MjQ1E29jqjAgaWw==
    </b></p>
    <p>Sello Digital del SAT: <b>YOEZDF9n1oqHTNGqGajreLS+eZOxjmhx4Pl17Hl3794SS+gosiHJhRZifn3e5qM2LMukpMaVu/pEsWD1is1zFRGmRSZ+nbm/9nz9qetV/YdnY2Nv7hmEOsqpjsj3OVXbC7E4caUBH84+KjD+qt8Hti+fIlz+S6sqcGIAf4xno7HF3qXYo8+x2ph33CwRL+n/eEZQfiSM8F5BZVY8TLJzv+gDt6atJtqk22p7/c2shiTbY0ut1ytcPCM149l+/qTYhP1VztrzqBCBeASSsfsMkmSzPiPRRUAhpYtokhbHwZLj1WYC51x8v/s61q7uWzq25ZJCWaXDb6oykFBPhT2TFQ==
    </b></p>
    <p>Cadena Original del Complemento de Certificación Digital del SAT: <b>||1.1|0123C5BF-FBE0-48B6-9625-A5A110E3F126|2019-05-13T10:44:55|GYS1010015I2|C4o7sTOqaZnsXkoAfxhorO4UqTQnDlUd1Bq6GFMGTojlx2oYIp40D2RoJpvrIuPbsh+0mZ1nEaXs6AWOvvcL9KdvbrqhSyIRCvw6Q5DWUXVDMh89w/oW+U7ISlnQUypDMSgAmMtGQSJEhO5FIdjXW/VTRfhoBP+mIdKV9CaCLoneaATKFxQtNBTFjuT5OIJ49k+FyMOiqNdbVs4nG/r7hnSqcBuWqKkEkL+zeQdGwy/pbyqOAw6j5oTn5E+o7Djo8tEAVkkUrue1jXhw6LeB9jQw913WvXvr31gR8ZKMSrkHYsrgkq9k2Jcj5j3HOGLcJIPSAJ8MjQ1E29jqjAgaWw==|00001000000407657133||
    </b></p>
    </div>
    `;

    await pdf.create(contenido).toFile(ruta_archivo_pdf, function (err, res) {
        if (err) {
            console.log(err);
        } else {
            console.log(res);
        }
    });

    // Enviar Mail
    var nodemailer = require('nodemailer');

    var transporter = nodemailer.createTransport({
        service: 'gmail',
        auth: {
            user: 'juanca0510.jcz@gmail.com',
            pass: 'twqccuesmcpzluwe'
        }
    });

    var mailOptions = {
        from: 'juanca0510.jcz@gmail.com',
        to: correo,
        subject: '[G-FACT] Recibo de nomina',
        text: `Hola estimado ${nombre_completo_empleado}, El presente correo contiene anexo su comprobante fiscal digital por internet.`,
        attachments: [{
            path: ruta_archivo_pdf
        }]
    };

    await transporter.sendMail(mailOptions, function (error, info) {
        if (error) {
            console.log(error);
        } else {
            console.log('Email sent: ' + info.response);
        }
    });

    let ruta_directa_pdf = path.join('..', 'pdf', nombre_completo_empleado, 'FACTURA_NOMINA_' + varDate + '.pdf');

    const nuevaFactura = {
        id_empleado,
        sueldo_diario,
        ruta_pdf: ruta_directa_pdf,
        ruta_xml: 'var/prebas.xml',
        fecha_timbrado: new Date(),
        nombre_completo_empleado,
        monto_total: sueldo_neto,
        email: correo,
        otros_pagos: otros_pagos != '' ? otros_pagos : 0,
        faltas: faltas != '' ? faltas : 0,
        retardos: retardos != '' ? retardos : 0,
        inicio_periodo,
        fin_periodo
    };

    await pool.query('INSERT INTO facturas SET ?', [nuevaFactura]);
    // Mensajes
    req.flash('success', 'Factura timbrada y enviada');
    res.redirect('/facturas');
});

module.exports = router;